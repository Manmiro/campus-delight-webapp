-- Headquarters customer creation is provisioned through auth.admin.createUser.
-- Customer deletion is deliberately limited to unused customer accounts so
-- orders, balances, and financial history remain available for audit.
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

  SELECT id, full_name, email, customer_code
  INTO v_profile
  FROM public.profiles
  WHERE id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_customer AND role <> 'customer'
  ) THEN
    RAISE EXCEPTION 'Staff and Headquarters accounts must be retired through their role controls';
  END IF;

  SELECT balance_kobo INTO v_wallet_balance
  FROM public.wallets
  WHERE customer_id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  SELECT available_tokens, locked_tokens INTO v_available_tokens, v_locked_tokens
  FROM public.token_accounts
  WHERE customer_id = p_customer
  FOR UPDATE;
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
  VALUES (
    auth.uid(),
    'delete_customer',
    'profiles',
    p_customer::text,
    jsonb_build_object('full_name', v_profile.full_name, 'email', v_profile.email, 'customer_code', v_profile.customer_code, 'reason', btrim(p_reason))
  );

  DELETE FROM public.profiles WHERE id = p_customer;
  RETURN jsonb_build_object('customer_id', p_customer, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_customer(uuid, text) TO authenticated;
