-- Headquarters outlet editing and guarded deletion.
CREATE OR REPLACE FUNCTION public.admin_delete_outlet(p_outlet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outlet public.outlets;
  v_customer_count bigint;
  v_order_count bigint;
  v_subscription_count bigint;
  v_loan_count bigint;
  v_transfer_count bigint;
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet is required';
  END IF;

  SELECT * INTO v_outlet FROM public.outlets WHERE id = p_outlet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet not found';
  END IF;

  SELECT count(*) INTO v_customer_count FROM public.profiles WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_order_count FROM public.orders WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_subscription_count FROM public.subscriptions WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_loan_count FROM public.loans WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_transfer_count
  FROM public.outlet_transfer_applications
  WHERE from_outlet_id = p_outlet_id OR to_outlet_id = p_outlet_id;

  IF v_customer_count > 0 OR v_order_count > 0 OR v_subscription_count > 0 OR v_loan_count > 0 OR v_transfer_count > 0 THEN
    RAISE EXCEPTION 'Outlet has customers or historical records; mark it inactive instead';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'delete_outlet', 'outlets', p_outlet_id::text,
    jsonb_build_object('name', v_outlet.name, 'code', v_outlet.code, 'status', v_outlet.status));

  DELETE FROM public.outlets WHERE id = p_outlet_id;
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_outlet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_outlet(uuid) TO authenticated;

-- Customer deletion limited to unused customer accounts.
CREATE OR REPLACE FUNCTION public.admin_delete_customer(p_customer uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_wallet_balance bigint;
  v_available_tokens bigint;
  v_locked_tokens bigint;
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_customer IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;
  IF p_customer = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own Headquarters account';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer';
  END IF;

  SELECT id, full_name, email, customer_code INTO v_profile
  FROM public.profiles WHERE id = p_customer FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_customer AND role <> 'customer') THEN
    RAISE EXCEPTION 'Staff and Headquarters accounts must be retired through their role controls';
  END IF;

  SELECT balance_kobo INTO v_wallet_balance FROM public.wallets WHERE customer_id = p_customer FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  SELECT available_tokens, locked_tokens INTO v_available_tokens, v_locked_tokens
  FROM public.token_accounts WHERE customer_id = p_customer FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token account not found';
  END IF;
  IF v_wallet_balance <> 0 OR v_available_tokens <> 0 OR v_locked_tokens <> 0 THEN
    RAISE EXCEPTION 'Customer must have zero cash and token balances before deletion';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.subscriptions WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.loans WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.loan_repayments WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.payment_transactions WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.outlet_transfer_applications WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.referrals WHERE referrer_id = p_customer OR referred_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.token_transfers WHERE sender_id = p_customer OR recipient_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.wallet_ledger WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.token_ledger WHERE customer_id = p_customer AND tx_type <> 'welcome')
    OR EXISTS (SELECT 1 FROM public.credit_limit_history WHERE customer_id = p_customer)
    OR EXISTS (SELECT 1 FROM public.meal_entitlements WHERE customer_id = p_customer)
  THEN
    RAISE EXCEPTION 'Customer has historical records; freeze the account instead';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), 'delete_customer', 'profiles', p_customer::text,
    jsonb_build_object('full_name', v_profile.full_name, 'email', v_profile.email, 'customer_code', v_profile.customer_code, 'reason', btrim(p_reason)));

  DELETE FROM public.profiles WHERE id = p_customer;
  RETURN jsonb_build_object('customer_id', p_customer, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer(uuid, text) TO authenticated;