-- Keep welcome tokens spendable on food while allowing only earned, purchased,
-- or already-eligible incoming tokens to leave the account.
ALTER TABLE public.token_accounts
  ADD COLUMN IF NOT EXISTS transferable_tokens bigint NOT NULL DEFAULT 0;

ALTER TABLE public.token_accounts
  DROP CONSTRAINT IF EXISTS token_accounts_transferable_tokens_valid;
ALTER TABLE public.token_accounts
  ADD CONSTRAINT token_accounts_transferable_tokens_valid
  CHECK (transferable_tokens >= 0 AND transferable_tokens <= available_tokens);

ALTER TABLE public.token_ledger
  DROP CONSTRAINT IF EXISTS token_ledger_tx_type_check;
ALTER TABLE public.token_ledger
  ADD CONSTRAINT token_ledger_tx_type_check
  CHECK (tx_type IN ('welcome','referral_locked','referral_unlock','transfer_in','transfer_out','transfer_fee','spend','expiry','reversal','admin','reward','purchase'));

-- Existing eligible credits are reconstructed conservatively. Historical food
-- spends are treated as consuming eligible tokens first, so welcome tokens can
-- never become transferable through the backfill.
WITH eligible AS (
  SELECT
    customer_id,
    GREATEST(
      0,
      SUM(CASE WHEN tx_type IN ('referral_unlock', 'reward', 'purchase', 'transfer_in') THEN GREATEST(to_available, 0) ELSE 0 END)
      - SUM(CASE WHEN tx_type IN ('transfer_out', 'transfer_fee', 'spend', 'expiry') THEN GREATEST(-to_available, 0) ELSE 0 END)
    ) AS balance
  FROM public.token_ledger
  GROUP BY customer_id
)
UPDATE public.token_accounts AS accounts
SET transferable_tokens = LEAST(accounts.available_tokens, COALESCE(eligible.balance, 0))
FROM eligible
WHERE eligible.customer_id = accounts.customer_id;

CREATE OR REPLACE FUNCTION public.sync_transferable_tokens_on_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Existing debit RPCs only change available_tokens. Consume eligible tokens
  -- first, while never allowing a welcome/admin balance to become transferable.
  IF NEW.available_tokens < OLD.available_tokens
     AND NEW.transferable_tokens = OLD.transferable_tokens THEN
    NEW.transferable_tokens := GREATEST(
      0,
      OLD.transferable_tokens - (OLD.available_tokens - NEW.available_tokens)
    );
  END IF;

  NEW.transferable_tokens := LEAST(GREATEST(NEW.transferable_tokens, 0), NEW.available_tokens);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_transferable_tokens_on_balance_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_transferable_tokens_on_balance_change
BEFORE UPDATE OF available_tokens, transferable_tokens ON public.token_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_transferable_tokens_on_balance_change();

CREATE OR REPLACE FUNCTION public.add_transferable_tokens_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tx_type IN ('referral_unlock', 'reward', 'purchase', 'transfer_in')
     AND NEW.to_available > 0 THEN
    UPDATE public.token_accounts
    SET transferable_tokens = LEAST(available_tokens, transferable_tokens + NEW.to_available),
        updated_at = now()
    WHERE customer_id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.add_transferable_tokens_from_ledger() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER add_transferable_tokens_from_ledger
AFTER INSERT ON public.token_ledger
FOR EACH ROW EXECUTE FUNCTION public.add_transferable_tokens_from_ledger();

CREATE OR REPLACE FUNCTION public.require_transferable_tokens_for_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transferable bigint;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'success' THEN
    SELECT transferable_tokens INTO v_transferable
    FROM public.token_accounts
    WHERE customer_id = NEW.sender_id
    FOR SHARE;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'success' AND OLD.status IS DISTINCT FROM 'success' THEN
    SELECT transferable_tokens INTO v_transferable
    FROM public.token_accounts
    WHERE customer_id = NEW.sender_id
    FOR SHARE;
  ELSE
    RETURN NEW;
  END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Token account not found';
    END IF;
    IF v_transferable < NEW.principal_tokens + NEW.fee_tokens THEN
      RAISE EXCEPTION 'Welcome tokens cannot be transferred; use earned or purchased tokens';
    END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_transferable_tokens_for_transfer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_transferable_tokens_for_transfer
BEFORE INSERT OR UPDATE OF status ON public.token_transfers
FOR EACH ROW EXECUTE FUNCTION public.require_transferable_tokens_for_transfer();

-- Token-funded outlet transfers are not food purchases, so they must not draw
-- from welcome tokens.
CREATE OR REPLACE FUNCTION public.apply_outlet_transfer(p_to_outlet_id uuid, p_fee_method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer uuid := auth.uid();
  v_from uuid;
  v_fee bigint;
  v_this_month int;
  v_ref text;
  v_balance bigint;
  v_avail bigint;
  v_locked bigint;
  v_transferable bigint;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_fee_method NOT IN ('cash','tokens') THEN RAISE EXCEPTION 'Choose one payment method: cash or tokens'; END IF;
  SELECT outlet_id INTO v_from FROM public.profiles WHERE id = v_customer;
  IF v_from = p_to_outlet_id THEN RAISE EXCEPTION 'You are already assigned to that outlet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = p_to_outlet_id AND status = 'active') THEN RAISE EXCEPTION 'Destination outlet is not active'; END IF;

  v_this_month := (
    SELECT count(*) FROM public.outlet_transfer_applications
    WHERE customer_id = v_customer
      AND (created_at AT TIME ZONE 'Africa/Lagos')::date >= date_trunc('month', (now() AT TIME ZONE 'Africa/Lagos')::date)
      AND status <> 'withdrawn'
  );
  IF v_this_month >= 1 THEN RAISE EXCEPTION 'You can submit only one outlet-transfer application per month'; END IF;

  v_fee := COALESCE((public.get_config('outlet_transfer_fee') ->> (CASE p_fee_method WHEN 'cash' THEN 'cash_kobo' ELSE 'tokens' END))::bigint, 0);

  IF p_fee_method = 'cash' THEN
    SELECT balance_kobo INTO v_balance FROM public.wallets WHERE customer_id = v_customer FOR UPDATE;
    IF v_balance < v_fee THEN RAISE EXCEPTION 'Insufficient wallet balance for the ₦500 fee'; END IF;
    UPDATE public.wallets SET balance_kobo = balance_kobo - v_fee, updated_at = now()
      WHERE customer_id = v_customer RETURNING balance_kobo INTO v_balance;
    INSERT INTO public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description)
      VALUES (v_customer, 'fee', -v_fee, v_balance, 'OTF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Outlet transfer application fee');
  ELSE
    SELECT available_tokens, locked_tokens, transferable_tokens
      INTO v_avail, v_locked, v_transferable
    FROM public.token_accounts
    WHERE customer_id = v_customer
    FOR UPDATE;
    IF v_transferable < v_fee THEN
      RAISE EXCEPTION 'Welcome tokens cannot pay an outlet-transfer fee; use earned or purchased tokens';
    END IF;
    UPDATE public.token_accounts SET available_tokens = available_tokens - v_fee, updated_at = now()
      WHERE customer_id = v_customer RETURNING available_tokens, locked_tokens INTO v_avail, v_locked;
    INSERT INTO public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
      VALUES (v_customer, 'spend', v_fee, -v_fee, v_avail, v_locked, 'OTF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Outlet transfer application fee');
  END IF;

  v_ref := 'OTA-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  INSERT INTO public.outlet_transfer_applications (customer_id, from_outlet_id, to_outlet_id, fee_method, fee_amount, status, reference)
    VALUES (v_customer, v_from, p_to_outlet_id, p_fee_method, v_fee, 'submitted', v_ref);

  INSERT INTO public.notifications (customer_id, title, body)
    VALUES (v_customer, 'Transfer application submitted', 'Application ' || v_ref || ' is awaiting headquarters review. The fee is non-refundable once submitted.');

  RETURN jsonb_build_object('reference', v_ref, 'fee', v_fee, 'fee_method', p_fee_method);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_outlet_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_outlet_transfer(uuid, text) TO authenticated;

-- A service-only hook for a future verified token purchase settlement. The
-- ledger trigger marks these credits as transferable without exposing a client
-- controlled token-credit endpoint.
CREATE OR REPLACE FUNCTION public.credit_purchased_tokens(p_customer uuid, p_amount bigint, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available bigint;
  v_locked bigint;
BEGIN
  IF p_customer IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid purchased-token credit'; END IF;
  IF p_reference IS NULL OR btrim(p_reference) = '' OR length(btrim(p_reference)) > 100 THEN RAISE EXCEPTION 'A valid purchase reference is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.token_ledger WHERE tx_type = 'purchase' AND reference = btrim(p_reference)) THEN
    SELECT available_tokens, locked_tokens INTO v_available, v_locked FROM public.token_accounts WHERE customer_id = p_customer;
    RETURN jsonb_build_object('applied', false, 'available_tokens', v_available, 'locked_tokens', v_locked, 'reference', btrim(p_reference));
  END IF;

  UPDATE public.token_accounts
  SET available_tokens = available_tokens + p_amount, updated_at = now()
  WHERE customer_id = p_customer
  RETURNING available_tokens, locked_tokens INTO v_available, v_locked;
  IF NOT FOUND THEN RAISE EXCEPTION 'Token account not found'; END IF;

  INSERT INTO public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
    VALUES (p_customer, 'purchase', p_amount, p_amount, v_available, v_locked, btrim(p_reference), 'Purchased Campus Delight tokens');

  RETURN jsonb_build_object('applied', true, 'available_tokens', v_available, 'locked_tokens', v_locked, 'reference', btrim(p_reference));
END;
$$;

REVOKE ALL ON FUNCTION public.credit_purchased_tokens(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_purchased_tokens(uuid, bigint, text) TO service_role;
