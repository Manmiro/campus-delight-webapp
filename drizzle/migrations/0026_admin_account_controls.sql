-- Headquarters-only account controls. All balance changes stay append-only in
-- the existing ledgers and are serialized by row locks.
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_balances(
  p_customer uuid,
  p_cash_delta_kobo bigint,
  p_token_delta bigint,
  p_reason text,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_cash_delta bigint := COALESCE(p_cash_delta_kobo, 0);
  v_token_delta bigint := COALESCE(p_token_delta, 0);
  v_cash_before bigint;
  v_cash_after bigint;
  v_tokens_before bigint;
  v_tokens_after bigint;
  v_locked_tokens bigint;
  v_reference text := COALESCE(NULLIF(btrim(p_reference), ''), 'HQ-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)));
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_customer IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;
  IF v_cash_delta = 0 AND v_token_delta = 0 THEN
    RAISE EXCEPTION 'Enter a cash or token adjustment';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer';
  END IF;
  IF length(v_reference) > 100 THEN
    RAISE EXCEPTION 'Reference must be 100 characters or fewer';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_customer;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT balance_kobo INTO v_cash_before
  FROM public.wallets
  WHERE customer_id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  SELECT available_tokens, locked_tokens INTO v_tokens_before, v_locked_tokens
  FROM public.token_accounts
  WHERE customer_id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token account not found';
  END IF;

  v_cash_after := v_cash_before + v_cash_delta;
  v_tokens_after := v_tokens_before + v_token_delta;
  IF v_cash_after < 0 THEN
    RAISE EXCEPTION 'Cash debit exceeds the wallet balance';
  END IF;
  IF v_tokens_after < 0 THEN
    RAISE EXCEPTION 'Token debit exceeds available tokens';
  END IF;

  IF v_cash_delta <> 0 THEN
    UPDATE public.wallets
    SET balance_kobo = v_cash_after, updated_at = now()
    WHERE customer_id = p_customer;

    INSERT INTO public.wallet_ledger (
      customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description
    ) VALUES (
      p_customer, 'admin', v_cash_delta, v_cash_after, v_reference,
      'Headquarters cash adjustment: ' || btrim(p_reason)
    );
  END IF;

  IF v_token_delta <> 0 THEN
    UPDATE public.token_accounts
    SET available_tokens = v_tokens_after, updated_at = now()
    WHERE customer_id = p_customer;

    INSERT INTO public.token_ledger (
      customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description
    ) VALUES (
      p_customer, 'admin', v_token_delta, v_token_delta, v_tokens_after, v_locked_tokens, v_reference,
      'Headquarters token adjustment: ' || btrim(p_reason)
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    v_actor,
    'admin_adjust_balances',
    'profiles',
    p_customer::text,
    jsonb_build_object(
      'reference', v_reference,
      'cash_delta_kobo', v_cash_delta,
      'cash_before_kobo', v_cash_before,
      'cash_after_kobo', v_cash_after,
      'token_delta', v_token_delta,
      'tokens_before', v_tokens_before,
      'tokens_after', v_tokens_after,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'reference', v_reference,
    'cash_balance_kobo', v_cash_after,
    'available_tokens', v_tokens_after,
    'locked_tokens', v_locked_tokens
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_customer uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous boolean;
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_customer IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Account status is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer';
  END IF;

  SELECT is_active INTO v_previous
  FROM public.profiles
  WHERE id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = p_customer;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    v_actor,
    CASE WHEN p_is_active THEN 'unfreeze_account' ELSE 'freeze_account' END,
    'profiles',
    p_customer::text,
    jsonb_build_object('previous_is_active', v_previous, 'is_active', p_is_active, 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object('customer_id', p_customer, 'previous_is_active', v_previous, 'is_active', p_is_active);
END;
$$;

-- Customers can edit their profile details, but account status stays
-- Headquarters-controlled.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, gender, date_of_birth, avatar_url, leaderboard_opt_in) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.admin_adjust_balances(uuid, bigint, bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balances(uuid, bigint, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;