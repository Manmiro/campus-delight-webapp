-- Approved security remediation. Compatible with both hosted checkout and the
-- meal_plan_caps.sql rollout. Apply after security_privilege_hotfix.sql.
-- No customer balances are reset.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active)
$$;
CREATE OR REPLACE FUNCTION public.require_active_user() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Account is frozen or unavailable' USING ERRCODE='42501';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.is_central_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_active_user() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='central_admin')
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_active_user() AND (_user_id=auth.uid() OR public.is_central_admin())
    AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE OR REPLACE FUNCTION public.is_outlet_manager(_outlet_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_active_user() AND EXISTS(SELECT 1 FROM public.outlet_staff
    WHERE user_id=auth.uid() AND outlet_id=_outlet_id AND staff_role='outlet_manager' AND status='active')
$$;
CREATE OR REPLACE FUNCTION public.is_outlet_staff(_outlet_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_active_user() AND EXISTS(SELECT 1 FROM public.outlet_staff
    WHERE user_id=auth.uid() AND outlet_id=_outlet_id AND status='active')
$$;

-- Pending plans are immutable from browsers. Cancellation/removal already uses
-- the service-only feature RPC; staff screens only read subscriptions.
REVOKE UPDATE, INSERT ON public.subscriptions FROM authenticated;
GRANT INSERT(customer_id,outlet_id,plan,tier,price_kobo,status) ON public.subscriptions TO authenticated;

DROP POLICY IF EXISTS "staff read outlet loans" ON public.loans;
CREATE POLICY "staff read outlet loans" ON public.loans FOR SELECT TO authenticated
  USING(public.is_outlet_staff(outlet_id));
DROP POLICY IF EXISTS "staff read outlet subscriptions" ON public.subscriptions;
CREATE POLICY "staff read outlet subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING(public.is_outlet_staff(outlet_id));

-- Make the other staff reads explicit too, rather than relying on a nested
-- profiles policy to accidentally restrict ordinary outlet customers.
DO $policy$
DECLARE table_name text; policy_name text;
BEGIN
  FOR table_name,policy_name IN SELECT * FROM (VALUES
    ('wallets','staff read outlet wallets'),('token_accounts','staff read outlet token accounts'),
    ('token_ledger','staff read outlet token ledgers'),('wallet_ledger','staff read outlet wallet ledgers'),
    ('customer_credit','staff read outlet credit'),('loan_repayments','staff read outlet repayments'),
    ('payment_transactions','staff read outlet payments'),('meal_entitlements','staff read outlet entitlements')
  ) AS policies(table_name,policy_name) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',policy_name,table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=customer_id AND public.is_outlet_staff(p.outlet_id)))',policy_name,table_name);
  END LOOP;
END; $policy$;
DROP POLICY IF EXISTS "staff read outlet transfers" ON public.token_transfers;
CREATE POLICY "staff read outlet transfers" ON public.token_transfers FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id IN (sender_id,recipient_id) AND public.is_outlet_staff(p.outlet_id)));

-- Active-account restrictions also protect direct PostgREST and storage calls.
-- Frozen users may still read their own profile so the app can explain the freeze.
DO $freeze$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "active account access" ON public.%I',t.tablename);
    EXECUTE format('CREATE POLICY "active account access" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_active_user()) WITH CHECK(public.is_active_user())',t.tablename);
  END LOOP;
END; $freeze$;
DROP POLICY IF EXISTS "active profile edits" ON public.profiles;
CREATE POLICY "active profile edits" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(public.is_active_user()) WITH CHECK(public.is_active_user());
DROP POLICY IF EXISTS "active storage access" ON storage.objects;
CREATE POLICY "active storage access" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.is_active_user()) WITH CHECK(public.is_active_user());
DROP POLICY IF EXISTS "dashboard users upload their attachments" ON storage.objects;
CREATE POLICY "dashboard users upload their attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='dashboard-attachments' AND name LIKE(auth.uid()::text||'/%')
    AND (public.is_central_admin() OR public.is_outlet_staff(public.my_outlet_id())));

-- Legacy callers always use the current fulfillment checkout, including cap
-- enforcement. Support the existing hosted signature during the rolling release.
CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb,p_payment_method text,p_subscription_id uuid DEFAULT NULL,p_loan_term_days integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cap bigint;
BEGIN
  PERFORM public.require_active_user();
  IF to_regprocedure('public.place_order_with_fulfillment(jsonb,text,text,text,bigint,uuid,integer,bigint)') IS NOT NULL THEN
    SELECT o.meal_cap_kobo INTO v_cap FROM public.outlets o JOIN public.profiles p ON p.outlet_id=o.id WHERE p.id=auth.uid();
    RETURN public.place_order_with_fulfillment(p_items,p_payment_method,'pickup',NULL,NULL,p_subscription_id,p_loan_term_days,v_cap);
  END IF;
  RETURN public.place_order_with_fulfillment(p_items,p_payment_method,'pickup',NULL,NULL,p_subscription_id,p_loan_term_days);
END; $$;

-- Definer RPCs bypass RLS, so enforce the same freeze inside their bodies.
-- Serialize token transfers before reading the daily total to close the race.
DO $guards$
DECLARE f record; definition text; guard text;
BEGIN
  FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND l.lanname='plpgsql' AND p.proname IN
      ('transfer_tokens','place_order','place_order_with_fulfillment','repay_loan','apply_outlet_transfer',
       'claim_daily_checkin','set_outlet_delivery_fee','fulfill_order','cancel_order',
       'admin_adjust_balances','admin_set_account_status','admin_adjust_credit_limit',
       'admin_remove_outlet_manager','admin_replace_outlet_manager','admin_set_outlet_manager_suspension',
       'admin_delete_customer','admin_delete_outlet','admin_set_outlet_price_edit_lock',
       'admin_set_outlet_meal_cap','admin_update_outlet_details','admin_set_loan_restriction_exception') LOOP
    definition:=pg_get_functiondef(f.oid);
    guard:='PERFORM public.require_active_user();';
    IF f.proname='transfer_tokens' THEN
      guard:=guard||' PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,740319));';
    END IF;
    IF position(guard IN definition)=0 THEN
      definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN '||guard,'i');
      EXECUTE definition;
    END IF;
  END LOOP;
END; $guards$;

-- No public financial definer helper inherits PostgreSQL's PUBLIC EXECUTE.
-- The allowlist is the app's intentional authenticated RPC surface.
DO $privileges$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid,p.oid::regprocedure::text AS signature,p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    IF f.proname IN ('has_role','is_active_user','is_central_admin','is_outlet_staff','is_outlet_manager','my_outlet_id',
      'transfer_tokens','place_order','place_order_with_fulfillment','repay_loan','apply_outlet_transfer','verify_otp',
      'claim_daily_checkin','weekly_leaderboard','customer_loan_restrictions','can_read_dashboard_message',
      'set_outlet_delivery_fee','fulfill_order','cancel_order','admin_adjust_balances','admin_set_account_status',
      'admin_adjust_credit_limit','admin_remove_outlet_manager','admin_replace_outlet_manager',
      'admin_set_outlet_manager_suspension','admin_delete_customer','admin_delete_outlet',
      'admin_set_outlet_price_edit_lock','admin_set_outlet_meal_cap','admin_update_outlet_details',
      'admin_set_loan_restriction_exception') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END IF;
  END LOOP;
END; $privileges$;

ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS checkout_snapshot jsonb;

CREATE TABLE IF NOT EXISTS public.request_rate_limits (
  key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  requests integer NOT NULL CHECK(requests>0)
);
REVOKE ALL ON public.request_rate_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.request_rate_limits TO service_role;
ALTER TABLE public.request_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS request_rate_limits_window_idx ON public.request_rate_limits(window_started_at);
CREATE OR REPLACE FUNCTION public.consume_request_budget(p_key_hash text,p_limit integer,p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_allowed boolean;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 10000 OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
  INSERT INTO public.request_rate_limits(key_hash,requests) VALUES(p_key_hash,1)
  ON CONFLICT(key_hash) DO UPDATE SET
    requests=CASE WHEN request_rate_limits.window_started_at<=now()-make_interval(secs=>p_window_seconds) THEN 1 ELSE request_rate_limits.requests+1 END,
    window_started_at=CASE WHEN request_rate_limits.window_started_at<=now()-make_interval(secs=>p_window_seconds) THEN now() ELSE request_rate_limits.window_started_at END
  WHERE request_rate_limits.window_started_at<=now()-make_interval(secs=>p_window_seconds) OR request_rate_limits.requests<p_limit
  RETURNING true INTO v_allowed;
  DELETE FROM public.request_rate_limits WHERE window_started_at<now()-interval '2 days';
  RETURN coalesce(v_allowed,false);
END; $$;
REVOKE ALL ON FUNCTION public.consume_request_budget(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_request_budget(text,integer,integer) TO service_role;

-- Restrict attachment content types at storage, before browsers can upload.
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/gif'] WHERE id='avatars';
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain'] WHERE id='dashboard-attachments';

-- Bind settlement to the plan and outlet that were actually quoted. Old pending
-- payments without snapshots are revalidated; mismatches are credited once to
-- the wallet, preserving funds and historical callback support.
CREATE OR REPLACE FUNCTION public.prepare_subscription_payment(p_customer_id uuid, p_subscription_id uuid, p_reference text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_outlet uuid; v_price bigint;
BEGIN
  SELECT outlet_id INTO v_outlet FROM public.profiles WHERE id = p_customer_id AND is_active FOR SHARE;
  IF NOT FOUND OR v_outlet IS NULL THEN RAISE EXCEPTION 'An active account with an assigned outlet is required'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR s.outlet_id IS DISTINCT FROM v_outlet OR s.status NOT IN ('awaiting_payment', 'renewal_pending') THEN
    RAISE EXCEPTION 'Subscription is not awaiting payment at your outlet';
  END IF;
  SELECT price_kobo INTO v_price FROM public.outlet_plan_prices
    WHERE outlet_id = v_outlet AND plan = s.plan AND tier = s.tier AND is_active FOR SHARE;
  IF NOT FOUND OR v_price <= 0 THEN RAISE EXCEPTION 'This plan is not available at your outlet'; END IF;
  UPDATE public.subscriptions SET price_kobo = v_price WHERE id = s.id;
  INSERT INTO public.payment_transactions(customer_id, purpose, amount_kobo, paystack_reference, status, related_id, checkout_snapshot)
    VALUES(p_customer_id, 'subscription', v_price, p_reference, 'pending', s.id,
      jsonb_build_object('customer_id',p_customer_id,'outlet_id',v_outlet,'plan',s.plan,'tier',s.tier,'price_kobo',v_price));
  RETURN v_price;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_subscription_payment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_subscription_payment(uuid, uuid, text) TO service_role;


CREATE OR REPLACE FUNCTION public.settle_verified_payment(p_reference text,p_amount_kobo bigint,p_currency text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx record; o record; s record; v_wallet_credit boolean := false;
BEGIN
  SELECT * INTO tx FROM public.payment_transactions WHERE paystack_reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'status','unknown_reference','purpose',null); END IF;
  IF p_currency IS DISTINCT FROM 'NGN' OR p_amount_kobo IS DISTINCT FROM tx.amount_kobo OR p_payload->>'status' IS DISTINCT FROM 'success' OR p_payload->>'reference' IS DISTINCT FROM p_reference THEN
    RETURN jsonb_build_object('applied',false,'status','verification_mismatch','purpose',tx.purpose);
  END IF;
  IF tx.status = 'success' THEN
    RETURN jsonb_build_object('applied',true,'status','success','purpose',tx.purpose,'already',true,
      'creditedToWallet',tx.purpose = 'subscription' AND EXISTS(SELECT 1 FROM public.wallet_ledger WHERE customer_id = tx.customer_id AND reference = p_reference AND tx_type = 'funding'));
  END IF;
  IF tx.purpose = 'wallet_funding' THEN
    PERFORM public.apply_wallet_funding(tx.customer_id,tx.amount_kobo,p_reference);
  ELSIF tx.purpose = 'subscription' THEN
    SELECT * INTO s FROM public.subscriptions WHERE id = tx.related_id AND customer_id = tx.customer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription does not match payment'; END IF;
    IF s.payment_reference = p_reference THEN
      NULL; -- This reference already activated the plan; never credit it again.
    ELSIF s.status IN ('awaiting_payment','renewal_pending') AND s.price_kobo = tx.amount_kobo
      AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.outlets quoted_outlet ON quoted_outlet.id=p.outlet_id
        WHERE p.id=s.customer_id AND p.is_active AND p.outlet_id=s.outlet_id AND quoted_outlet.status='active')
      AND (tx.checkout_snapshot = jsonb_build_object('customer_id',s.customer_id,'outlet_id',s.outlet_id,'plan',s.plan,'tier',s.tier,'price_kobo',s.price_kobo)
        OR (tx.checkout_snapshot IS NULL AND EXISTS(SELECT 1 FROM public.outlet_plan_prices price
          WHERE price.outlet_id=s.outlet_id AND price.plan=s.plan AND price.tier=s.tier AND price.is_active AND price.price_kobo=tx.amount_kobo))) THEN
      PERFORM public.activate_subscription(s.id,p_reference);
    ELSE
      PERFORM public.apply_wallet_funding(tx.customer_id,tx.amount_kobo,p_reference);
      v_wallet_credit := true;
    END IF;
  ELSIF tx.purpose = 'order_payment' THEN
    SELECT * INTO o FROM public.orders WHERE id=tx.related_id AND customer_id=tx.customer_id AND payment_method='card' AND total_kobo=tx.amount_kobo AND reference=p_reference FOR UPDATE;
    IF NOT FOUND OR o.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be confirmed'; END IF;
    UPDATE public.orders SET status='confirmed' WHERE id=o.id;
    PERFORM public.unlock_referral_reward(tx.customer_id);
    INSERT INTO public.notifications(customer_id,title,body) VALUES(tx.customer_id,'Order placed','Order '||o.reference||' confirmed at your outlet.');
  ELSE RAISE EXCEPTION 'Unsupported payment purpose'; END IF;
  UPDATE public.payment_transactions SET status='success',verified_at=now(),payload=p_payload WHERE id=tx.id;
  RETURN jsonb_build_object('applied',true,'status','success','purpose',tx.purpose,'creditedToWallet',v_wallet_credit);
END; $$;
REVOKE ALL ON FUNCTION public.settle_verified_payment(text,bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_verified_payment(text,bigint,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
