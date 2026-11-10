-- PROPOSED: business approval required before adding this to the migration journal.
-- Apply the approved SQL before deploying the matching subscription UI/handlers.
-- Only authenticated feature handlers may pass a customer id to these service RPCs.
CREATE OR REPLACE FUNCTION public.pay_subscription_from_wallet(p_customer_id uuid, p_subscription_id uuid, p_price_kobo bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  v_outlet uuid;
  v_price bigint;
  v_balance bigint;
  v_reference text;
BEGIN
  SELECT outlet_id INTO v_outlet FROM public.profiles WHERE id = p_customer_id AND is_active FOR SHARE;
  IF NOT FOUND OR v_outlet IS NULL THEN RAISE EXCEPTION 'An active account with an assigned outlet is required'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found for your account'; END IF;
  -- A repeated request returns the original committed debit, without charging again.
  IF s.status = 'active' AND s.payment_reference LIKE 'CDWS-%' THEN
    SELECT balance_after_kobo INTO v_balance FROM public.wallet_ledger
      WHERE customer_id = p_customer_id AND reference = s.payment_reference AND tx_type = 'debit';
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription payment record is missing'; END IF;
    RETURN jsonb_build_object('reference', s.payment_reference, 'balanceKobo', v_balance, 'already', true);
  END IF;
  IF s.status NOT IN ('awaiting_payment', 'renewal_pending') THEN RAISE EXCEPTION 'Subscription is not awaiting payment'; END IF;
  IF s.outlet_id IS DISTINCT FROM v_outlet THEN RAISE EXCEPTION 'Subscription is not at your assigned outlet'; END IF;
  SELECT price_kobo INTO v_price FROM public.outlet_plan_prices
    WHERE outlet_id = v_outlet AND plan = s.plan AND tier = s.tier AND is_active FOR SHARE;
  IF NOT FOUND OR v_price <= 0 THEN RAISE EXCEPTION 'This plan is not available at your outlet'; END IF;
  IF p_price_kobo IS DISTINCT FROM v_price THEN RAISE EXCEPTION 'Plan price changed. Refresh and try again'; END IF;
  SELECT balance_kobo INTO v_balance FROM public.wallets WHERE customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < v_price THEN RAISE EXCEPTION 'Insufficient wallet balance. Top up your wallet'; END IF;
  v_reference := 'CDWS-' || gen_random_uuid()::text;
  v_balance := v_balance - v_price;
  UPDATE public.wallets SET balance_kobo = v_balance, updated_at = now() WHERE customer_id = p_customer_id;
  INSERT INTO public.wallet_ledger(customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description)
    VALUES(p_customer_id, 'debit', -v_price, v_balance, v_reference,
      'Meal subscription: ' || initcap(s.plan) || ' (' || initcap(s.tier) || ')');
  UPDATE public.subscriptions SET price_kobo = v_price WHERE id = s.id;
  PERFORM public.activate_subscription(s.id, v_reference);
  RETURN jsonb_build_object('reference', v_reference, 'balanceKobo', v_balance, 'already', false);
END; $$;
REVOKE ALL ON FUNCTION public.pay_subscription_from_wallet(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_subscription_from_wallet(uuid, uuid, bigint) TO service_role;

-- Reserve the online payment and its authoritative price while holding the same
-- subscription lock as wallet checkout, cancellation and payment settlement.
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
  INSERT INTO public.payment_transactions(customer_id, purpose, amount_kobo, paystack_reference, status, related_id)
    VALUES(p_customer_id, 'subscription', v_price, p_reference, 'pending', s.id);
  RETURN v_price;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_subscription_payment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_subscription_payment(uuid, uuid, text) TO service_role;

-- Keep payment history for late Paystack callbacks, while removing unpaid plans
-- from the customer's visible list. Paid plans cannot be removed here.
CREATE OR REPLACE FUNCTION public.remove_pending_subscription(p_customer_id uuid, p_subscription_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id AND customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found for your account'; END IF;
  IF s.status = 'cancelled' AND s.payment_reference IS NULL THEN RETURN; END IF;
  IF s.status <> 'awaiting_payment' OR s.payment_reference IS NOT NULL THEN RAISE EXCEPTION 'Only an unpaid plan can be removed'; END IF;
  UPDATE public.subscriptions SET status = 'cancelled' WHERE id = s.id;
END; $$;
REVOKE ALL ON FUNCTION public.remove_pending_subscription(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pending_subscription(uuid, uuid) TO service_role;

-- Preserve historical online settlement. If checkout completes after a wallet
-- purchase, cancellation or price change, credit the received money to the
-- wallet exactly once rather than charging twice for one meal plan.
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
    ELSIF s.status IN ('awaiting_payment','renewal_pending') AND s.price_kobo = tx.amount_kobo THEN
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
