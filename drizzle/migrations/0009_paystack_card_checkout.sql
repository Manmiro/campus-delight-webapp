ALTER TABLE public.orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash_wallet','tokens','subscription_entitlement','food_credit','card'));

CREATE OR REPLACE FUNCTION public.prepare_card_order(p_customer_id uuid, p_items jsonb, p_reference text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_outlet uuid; v_order uuid; v_total bigint := 0; item jsonb; mi record; v_qty integer;
BEGIN
 SELECT outlet_id INTO v_outlet FROM public.profiles WHERE id=p_customer_id AND is_active=true FOR SHARE;
 IF v_outlet IS NULL THEN RAISE EXCEPTION 'No active outlet assignment'; END IF;
 IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid order'; END IF;
 INSERT INTO public.orders(customer_id,outlet_id,payment_method,total_kobo,status,reference) VALUES(p_customer_id,v_outlet,'card',0,'pending',p_reference) RETURNING id INTO v_order;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  v_qty := (item->>'quantity')::integer;
  IF v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO mi FROM public.menu_items WHERE id=(item->>'menu_item_id')::uuid AND outlet_id=v_outlet AND is_available=true FOR SHARE;
  IF NOT FOUND OR mi.price_kobo <= 0 THEN RAISE EXCEPTION 'Menu item not available at your outlet'; END IF;
  v_total := v_total + mi.price_kobo*v_qty;
  INSERT INTO public.order_items(order_id,menu_item_id,item_name,unit_price_kobo,quantity) VALUES(v_order,mi.id,mi.name,mi.price_kobo,v_qty);
 END LOOP;
 IF v_total <= 0 OR v_total > 9007199254740991 THEN RAISE EXCEPTION 'Invalid order total'; END IF;
 UPDATE public.orders SET total_kobo=v_total WHERE id=v_order;
 INSERT INTO public.payment_transactions(customer_id,purpose,amount_kobo,paystack_reference,status,related_id) VALUES(p_customer_id,'order_payment',v_total,p_reference,'pending',v_order);
 RETURN v_order;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_card_order(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_card_order(uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_verified_payment(p_reference text,p_amount_kobo bigint,p_currency text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx record; o record;
BEGIN
 SELECT * INTO tx FROM public.payment_transactions WHERE paystack_reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'status','unknown_reference','purpose',null); END IF;
 IF p_currency IS DISTINCT FROM 'NGN' OR p_amount_kobo IS DISTINCT FROM tx.amount_kobo OR p_payload->>'status' IS DISTINCT FROM 'success' OR p_payload->>'reference' IS DISTINCT FROM p_reference THEN
  RETURN jsonb_build_object('applied',false,'status','verification_mismatch','purpose',tx.purpose);
 END IF;
 IF tx.status='success' THEN RETURN jsonb_build_object('applied',true,'status','success','purpose',tx.purpose,'already',true); END IF;
 IF tx.purpose='wallet_funding' THEN
  PERFORM public.apply_wallet_funding(tx.customer_id,tx.amount_kobo,p_reference);
 ELSIF tx.purpose='subscription' THEN
  PERFORM 1 FROM public.subscriptions WHERE id=tx.related_id AND customer_id=tx.customer_id AND price_kobo=tx.amount_kobo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription does not match payment'; END IF;
  PERFORM public.activate_subscription(tx.related_id,p_reference);
 ELSIF tx.purpose='order_payment' THEN
  SELECT * INTO o FROM public.orders WHERE id=tx.related_id AND customer_id=tx.customer_id AND payment_method='card' AND total_kobo=tx.amount_kobo AND reference=p_reference FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be confirmed'; END IF;
  UPDATE public.orders SET status='confirmed' WHERE id=o.id;
  PERFORM public.unlock_referral_reward(tx.customer_id);
  INSERT INTO public.notifications(customer_id,title,body) VALUES(tx.customer_id,'Order placed','Order '||o.reference||' confirmed at your outlet.');
 ELSE RAISE EXCEPTION 'Unsupported payment purpose'; END IF;
 UPDATE public.payment_transactions SET status='success',verified_at=now(),payload=p_payload WHERE id=tx.id;
 RETURN jsonb_build_object('applied',true,'status','success','purpose',tx.purpose);
END; $$;
REVOKE ALL ON FUNCTION public.settle_verified_payment(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_verified_payment(text,bigint,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o record; v_avail bigint; v_locked bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF NOT public.is_outlet_staff(o.outlet_id) AND NOT public.is_central_admin() THEN RAISE EXCEPTION 'Forbidden: not staff of this outlet'; END IF;
 IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed orders can be cancelled'; END IF;
 UPDATE public.orders SET status='cancelled' WHERE id=p_order_id;
 IF o.payment_method IN ('cash_wallet','card') THEN
  PERFORM public.apply_wallet_refund(o.customer_id,o.total_kobo,'REFUND-'||upper(left(replace(gen_random_uuid()::text,'-',''),10)),o.id);
 ELSIF o.payment_method='tokens' THEN
  UPDATE public.token_accounts SET available_tokens=available_tokens+o.tokens_used,updated_at=now() WHERE customer_id=o.customer_id RETURNING available_tokens,locked_tokens INTO v_avail,v_locked;
  INSERT INTO public.token_ledger(customer_id,tx_type,amount,to_available,available_after,locked_after,reference,description) VALUES(o.customer_id,'reversal',o.tokens_used,o.tokens_used,v_avail,v_locked,'REVT-'||upper(left(replace(gen_random_uuid()::text,'-',''),10)),'Order cancelled — tokens returned');
 ELSIF o.payment_method='subscription_entitlement' THEN
  UPDATE public.meal_entitlements SET redeemed=greatest(redeemed-1,0) WHERE subscription_id=o.subscription_id AND service_date=(o.created_at AT TIME ZONE 'Africa/Lagos')::date;
 ELSIF o.payment_method='food_credit' AND o.loan_id IS NOT NULL THEN
  UPDATE public.loans SET status='cancelled' WHERE id=o.loan_id AND status='active';
  UPDATE public.customer_credit SET outstanding_kobo=greatest(outstanding_kobo-(SELECT total_due_kobo FROM public.loans WHERE id=o.loan_id),0) WHERE customer_id=o.customer_id;
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id) VALUES(auth.uid(),'cancel_order','orders',p_order_id::text);
END; $$;