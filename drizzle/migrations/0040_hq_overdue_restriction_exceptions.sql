CREATE TABLE public.loan_restriction_exceptions (
 loan_id uuid PRIMARY KEY REFERENCES public.loans(id),
 ordering_restored boolean NOT NULL DEFAULT false,
 transfers_restored boolean NOT NULL DEFAULT false,
 reason text NOT NULL,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.loan_restriction_exceptions TO authenticated;
GRANT ALL ON public.loan_restriction_exceptions TO service_role;
ALTER TABLE public.loan_restriction_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HQ or borrower reads exceptions" ON public.loan_restriction_exceptions FOR SELECT TO authenticated USING (public.is_central_admin() OR EXISTS (SELECT 1 FROM public.loans l WHERE l.id=loan_id AND l.customer_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_set_loan_restriction_exception(p_loan_id uuid, p_ordering_restored boolean, p_transfers_restored boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l record; previous jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_central_admin() THEN RAISE EXCEPTION 'Forbidden: central administrators only'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason))=0 OR length(p_reason)>500 OR p_ordering_restored IS NULL OR p_transfers_restored IS NULL THEN RAISE EXCEPTION 'A reason and both choices are required'; END IF;
 SELECT * INTO l FROM public.loans WHERE id=p_loan_id FOR UPDATE;
 IF NOT FOUND OR l.status NOT IN ('active','partially_repaid','overdue') THEN RAISE EXCEPTION 'Open loan not found'; END IF;
 SELECT to_jsonb(e) INTO previous FROM public.loan_restriction_exceptions e WHERE loan_id=p_loan_id;
 INSERT INTO public.loan_restriction_exceptions(loan_id,ordering_restored,transfers_restored,reason,updated_by)
 VALUES(p_loan_id,p_ordering_restored,p_transfers_restored,trim(p_reason),auth.uid())
 ON CONFLICT(loan_id) DO UPDATE SET ordering_restored=excluded.ordering_restored,transfers_restored=excluded.transfers_restored,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,details) VALUES(auth.uid(),'set_loan_restriction_exception','loans',p_loan_id::text,jsonb_build_object('previous',previous,'ordering_restored',p_ordering_restored,'transfers_restored',p_transfers_restored,'reason',trim(p_reason)));
 RETURN jsonb_build_object('loan_id',p_loan_id,'ordering_restored',p_ordering_restored,'transfers_restored',p_transfers_restored);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_loan_restriction_exception(uuid,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_loan_restriction_exception(uuid,boolean,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_loan_restrictions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'hasOverdue', EXISTS(SELECT 1 FROM public.loans l WHERE l.customer_id=auth.uid() AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<now()),
 'orderingLocked', EXISTS(SELECT 1 FROM public.loans l LEFT JOIN public.loan_restriction_exceptions e ON e.loan_id=l.id WHERE l.customer_id=auth.uid() AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<=now()-interval '3 days' AND NOT coalesce(e.ordering_restored,false)),
 'transfersFrozen', EXISTS(SELECT 1 FROM public.loans l LEFT JOIN public.loan_restriction_exceptions e ON e.loan_id=l.id WHERE l.customer_id=auth.uid() AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<now() AND NOT coalesce(e.transfers_restored,false))
 );
$$;
REVOKE ALL ON FUNCTION public.customer_loan_restrictions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_loan_restrictions() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_overdue_order_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.payment_method='subscription_entitlement' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.loans l LEFT JOIN public.loan_restriction_exceptions e ON e.loan_id=l.id WHERE l.customer_id=NEW.customer_id AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<=now()-interval '3 days' AND NOT coalesce(e.ordering_restored,false)) THEN RAISE EXCEPTION 'Ordering is paused due to overdue debt. Meal subscriptions still work; repay your loan or contact headquarters.'; END IF;
 IF NEW.payment_method='food_credit' AND EXISTS(SELECT 1 FROM public.loans l WHERE l.customer_id=NEW.customer_id AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<now()) THEN RAISE EXCEPTION 'Pay Later is unavailable while a loan is overdue. Repay it first.'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_overdue_order_lock() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.freeze_transfers_for_overdue_loans()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.loans l LEFT JOIN public.loan_restriction_exceptions e ON e.loan_id=l.id WHERE l.customer_id=NEW.sender_id AND l.status IN ('active','partially_repaid','overdue') AND l.due_at<now() AND NOT coalesce(e.transfers_restored,false)) THEN RAISE EXCEPTION 'Token transfers are frozen due to overdue debt. Repay your loan or contact headquarters.'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.freeze_transfers_for_overdue_loans() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.overdue_loan_warnings()
RETURNS TABLE(loan_id uuid,customer_id uuid,email text,full_name text,outlet_name text,item_summary text,due_at timestamptz,overdue_day integer,total_due_kobo bigint,overdue_kobo bigint,balance_kobo bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,l.customer_id,p.email,p.full_name,o.name,l.item_summary,l.due_at,floor(extract(epoch FROM(now()-l.due_at))/86400)::integer,l.total_due_kobo,l.overdue_kobo,public.loan_outstanding_kobo(l.id)
 FROM public.loans l JOIN public.profiles p ON p.id=l.customer_id LEFT JOIN public.outlets o ON o.id=l.outlet_id
 WHERE l.status IN ('active','partially_repaid','overdue') AND floor(extract(epoch FROM(now()-l.due_at))/86400) BETWEEN 1 AND 2 AND p.email IS NOT NULL AND p.is_active AND public.loan_outstanding_kobo(l.id)>0;
$$;
REVOKE ALL ON FUNCTION public.overdue_loan_warnings() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.overdue_loan_warnings() TO service_role;