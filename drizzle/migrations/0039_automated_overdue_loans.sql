-- Automated overdue Pay Later loans (business-approved):
-- 10% of the original total due per completed 24 hours unpaid (uncapped), wallet funding
-- auto-repays open loans, ordering locks 3 days after due (except meal subscriptions),
-- and token transfers freeze while any loan is overdue.

CREATE OR REPLACE FUNCTION public.loan_outstanding_kobo(p_loan_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest(l.total_due_kobo + l.overdue_kobo - coalesce((
    SELECT sum(r.amount_kobo) FROM public.loan_repayments r WHERE r.loan_id = l.id AND r.status = 'successful'), 0), 0)::bigint
  FROM public.loans l WHERE l.id = p_loan_id;
$$;
REVOKE ALL ON FUNCTION public.loan_outstanding_kobo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loan_outstanding_kobo(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accrue_loan_overdue(p_loan_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_days bigint; v_charge bigint; v_overdue bigint;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF l.status NOT IN ('active', 'partially_repaid', 'overdue') OR now() <= l.due_at THEN RETURN l.overdue_kobo; END IF;
  IF public.loan_outstanding_kobo(l.id) <= 0 THEN RETURN l.overdue_kobo; END IF;
  v_days := floor(extract(epoch FROM (now() - l.due_at)) / 86400)::bigint;
  v_charge := (l.total_due_kobo * 10 * v_days) / 100;
  UPDATE public.loans SET overdue_kobo = greatest(overdue_kobo, v_charge), status = 'overdue'
    WHERE id = l.id RETURNING overdue_kobo INTO v_overdue;
  RETURN v_overdue;
END; $$;
REVOKE ALL ON FUNCTION public.accrue_loan_overdue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_loan_overdue(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_customer_outstanding(p_customer uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint;
BEGIN
  SELECT coalesce(sum(public.loan_outstanding_kobo(l.id)), 0)::bigint INTO v_total
    FROM public.loans l WHERE l.customer_id = p_customer AND l.status IN ('active', 'partially_repaid', 'overdue');
  UPDATE public.customer_credit SET outstanding_kobo = v_total, updated_at = now() WHERE customer_id = p_customer;
  RETURN v_total;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_customer_outstanding(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_customer_outstanding(uuid) TO service_role;

-- Service-only: accrue every overdue loan; run hourly by the overdue job.
CREATE OR REPLACE FUNCTION public.process_overdue_loans()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_loans integer := 0; v_customers uuid[] := '{}'; c uuid;
BEGIN
  FOR r IN SELECT id, customer_id FROM public.loans
    WHERE status IN ('active', 'partially_repaid', 'overdue') AND due_at < now() ORDER BY due_at LOOP
    PERFORM public.accrue_loan_overdue(r.id);
    v_loans := v_loans + 1;
    IF NOT (r.customer_id = ANY (v_customers)) THEN v_customers := v_customers || r.customer_id; END IF;
  END LOOP;
  FOREACH c IN ARRAY v_customers LOOP PERFORM public.refresh_customer_outstanding(c); END LOOP;
  RETURN jsonb_build_object('loans', v_loans, 'customers', coalesce(array_length(v_customers, 1), 0));
END; $$;
REVOKE ALL ON FUNCTION public.process_overdue_loans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_overdue_loans() TO service_role;

-- Service-only: overdue loans on Lagos overdue day 1 or 2 that still owe money (for warning emails).
CREATE OR REPLACE FUNCTION public.overdue_loan_warnings()
RETURNS TABLE (
  loan_id uuid, customer_id uuid, email text, full_name text, outlet_name text, item_summary text,
  due_at timestamptz, overdue_day integer, total_due_kobo bigint, overdue_kobo bigint, balance_kobo bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS d)
  SELECT l.id, l.customer_id, p.email, p.full_name, o.name, l.item_summary, l.due_at,
         (t.d - (l.due_at AT TIME ZONE 'Africa/Lagos')::date)::integer,
         l.total_due_kobo, l.overdue_kobo, public.loan_outstanding_kobo(l.id)
  FROM public.loans l
  CROSS JOIN today t
  JOIN public.profiles p ON p.id = l.customer_id
  LEFT JOIN public.outlets o ON o.id = l.outlet_id
  WHERE l.status IN ('active', 'partially_repaid', 'overdue')
    AND l.due_at < now()
    AND (t.d - (l.due_at AT TIME ZONE 'Africa/Lagos')::date) BETWEEN 1 AND 2
    AND p.email IS NOT NULL AND p.is_active
    AND public.loan_outstanding_kobo(l.id) > 0
  ORDER BY l.due_at
  LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.overdue_loan_warnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overdue_loan_warnings() TO service_role;

-- Core wallet repayment shared by customer repayments and automatic offsets.
CREATE OR REPLACE FUNCTION public.apply_loan_repayment(p_customer uuid, p_loan_id uuid, p_amount_kobo bigint, p_reference text, p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l record; v_outstanding bigint; v_balance bigint;
  v_prev_limit bigint; v_new_limit bigint; v_adj text; v_total bigint;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN RAISE EXCEPTION 'Invalid repayment amount'; END IF;
  PERFORM public.accrue_loan_overdue(p_loan_id);
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id AND customer_id = p_customer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;
  IF l.status NOT IN ('active', 'partially_repaid', 'overdue') THEN RAISE EXCEPTION 'Loan already settled'; END IF;
  v_outstanding := public.loan_outstanding_kobo(l.id);
  IF p_amount_kobo > v_outstanding THEN
    RAISE EXCEPTION 'That is more than you owe. Outstanding balance: ₦%', (v_outstanding / 100.0)::numeric(14,2);
  END IF;

  SELECT balance_kobo INTO v_balance FROM public.wallets WHERE customer_id = p_customer FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount_kobo THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  UPDATE public.wallets SET balance_kobo = balance_kobo - p_amount_kobo, updated_at = now()
    WHERE customer_id = p_customer RETURNING balance_kobo INTO v_balance;
  INSERT INTO public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, related_loan_id, description)
    VALUES (p_customer, 'debit', -(p_amount_kobo), v_balance, p_reference, l.id, p_description);
  INSERT INTO public.loan_repayments (loan_id, customer_id, amount_kobo, method, status, reference)
    VALUES (l.id, p_customer, p_amount_kobo, 'cash_wallet', 'successful', p_reference);

  v_outstanding := public.loan_outstanding_kobo(l.id);
  IF v_outstanding = 0 THEN
    INSERT INTO public.customer_credit (customer_id, credit_limit_kobo, outstanding_kobo) VALUES (p_customer, 210000, 0)
      ON CONFLICT (customer_id) DO NOTHING;
    SELECT credit_limit_kobo INTO v_prev_limit FROM public.customer_credit WHERE customer_id = p_customer FOR UPDATE;
    IF now() <= l.due_at THEN
      UPDATE public.loans SET status = 'fully_repaid_on_time', settled_at = now() WHERE id = l.id;
      v_new_limit := v_prev_limit * 2; v_adj := 'timely_double';
    ELSE
      UPDATE public.loans SET status = 'fully_repaid_late', settled_at = now() WHERE id = l.id;
      v_new_limit := floor(v_prev_limit::numeric * 0.70)::bigint; v_adj := 'untimely_reduce';
    END IF;
    UPDATE public.customer_credit SET credit_limit_kobo = v_new_limit, updated_at = now() WHERE customer_id = p_customer;
    INSERT INTO public.credit_limit_history (customer_id, previous_limit_kobo, new_limit_kobo, adjustment_type, trigger_loan_id, notes)
      VALUES (p_customer, v_prev_limit, v_new_limit, v_adj, l.id, CASE WHEN v_adj = 'timely_double' THEN 'Timely full repayment: limit doubled' ELSE 'Late full repayment: limit reduced by exactly 30%' END);
    INSERT INTO public.notifications (customer_id, title, body)
      VALUES (p_customer, 'Loan settled', CASE WHEN v_adj = 'timely_double' THEN 'Loan settled on time. Your credit limit doubled to ₦' || (v_new_limit / 100.0)::text ELSE 'Loan settled late. Your credit limit is now ₦' || (v_new_limit / 100.0)::text END);
  ELSE
    UPDATE public.loans SET status = CASE WHEN now() > l.due_at THEN 'overdue' ELSE 'partially_repaid' END WHERE id = l.id;
    INSERT INTO public.notifications (customer_id, title, body)
      VALUES (p_customer, 'Repayment received', '₦' || (p_amount_kobo / 100.0)::text || ' applied. Outstanding: ₦' || (v_outstanding / 100.0)::text);
  END IF;

  v_total := public.refresh_customer_outstanding(p_customer);
  RETURN jsonb_build_object('reference', p_reference, 'loan_id', l.id, 'amount_kobo', p_amount_kobo,
    'outstanding_kobo', v_outstanding, 'total_outstanding_kobo', v_total,
    'status', CASE WHEN v_outstanding = 0 THEN v_adj ELSE 'partially_repaid' END);
END; $$;
REVOKE ALL ON FUNCTION public.apply_loan_repayment(uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loan_repayment(uuid, uuid, bigint, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.repay_loan(p_loan_id uuid, p_amount_kobo bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid := auth.uid();
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN public.apply_loan_repayment(v_customer, p_loan_id, p_amount_kobo,
    'REP-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Loan repayment');
END; $$;

-- Wallet funding now automatically repays open Pay Later loans (oldest due first).
CREATE OR REPLACE FUNCTION public.apply_wallet_funding(p_customer_id uuid, p_amount_kobo bigint, p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance bigint; v_left bigint; v_out bigint; v_take bigint; v_n integer := 0; r record;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE reference = p_reference AND tx_type = 'funding') THEN
    RETURN false; -- already applied (idempotent)
  END IF;
  UPDATE public.wallets SET balance_kobo = balance_kobo + p_amount_kobo, updated_at = now()
    WHERE customer_id = p_customer_id RETURNING balance_kobo INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  INSERT INTO public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description)
    VALUES (p_customer_id, 'funding', p_amount_kobo, v_balance, p_reference, 'Wallet funding via Paystack');
  INSERT INTO public.notifications (customer_id, title, body)
    VALUES (p_customer_id, 'Wallet funded', '₦' || (p_amount_kobo / 100.0)::text || ' added to your wallet. Ref ' || p_reference);

  v_left := p_amount_kobo;
  FOR r IN SELECT id FROM public.loans
    WHERE customer_id = p_customer_id AND status IN ('active', 'partially_repaid', 'overdue')
    ORDER BY due_at, created_at LOOP
    EXIT WHEN v_left <= 0;
    PERFORM public.accrue_loan_overdue(r.id);
    v_out := public.loan_outstanding_kobo(r.id);
    v_take := least(v_left, v_out);
    IF v_take > 0 THEN
      v_n := v_n + 1;
      PERFORM public.apply_loan_repayment(p_customer_id, r.id, v_take, 'AUTO-' || p_reference || '-' || v_n,
        'Automatic Pay Later repayment from wallet funding');
      v_left := v_left - v_take;
    END IF;
  END LOOP;
  RETURN true;
END; $$;

-- Ordering lock: 3 full days after a loan's due time, only meal subscription orders are allowed.
CREATE OR REPLACE FUNCTION public.enforce_overdue_order_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_method = 'subscription_entitlement' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.loans WHERE customer_id = NEW.customer_id
      AND status IN ('active', 'partially_repaid', 'overdue') AND due_at <= now() - interval '3 days') THEN
    RAISE EXCEPTION 'Ordering is paused because your Pay Later loan is more than 3 days overdue. Repay it to order again — meal subscription orders still work.';
  END IF;
  IF NEW.payment_method = 'food_credit' AND EXISTS (SELECT 1 FROM public.loans WHERE customer_id = NEW.customer_id
      AND status IN ('active', 'partially_repaid', 'overdue') AND due_at < now()) THEN
    RAISE EXCEPTION 'Pay Later is unavailable while a loan is overdue. Repay it first.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_overdue_order_lock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_overdue_order_lock ON public.orders;
CREATE TRIGGER enforce_overdue_order_lock BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_overdue_order_lock();

-- Token transfer freeze: no outgoing transfers while any loan is overdue.
CREATE OR REPLACE FUNCTION public.freeze_transfers_for_overdue_loans()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.loans WHERE customer_id = NEW.sender_id
      AND status IN ('active', 'partially_repaid', 'overdue') AND due_at < now()) THEN
    RAISE EXCEPTION 'Token transfers are frozen while your Pay Later loan is overdue. Repay it to send tokens again.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.freeze_transfers_for_overdue_loans() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS freeze_transfers_for_overdue_loans ON public.token_transfers;
CREATE TRIGGER freeze_transfers_for_overdue_loans BEFORE INSERT ON public.token_transfers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_transfers_for_overdue_loans();
