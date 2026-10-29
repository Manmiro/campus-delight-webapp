ALTER TABLE public.outlets ADD COLUMN delivery_fee_kobo bigint NOT NULL DEFAULT 60000 CONSTRAINT outlets_delivery_fee_nonnegative CHECK (delivery_fee_kobo >= 0);
ALTER TABLE public.orders ADD COLUMN fulfillment_method text NOT NULL DEFAULT 'pickup' CONSTRAINT orders_fulfillment_method_valid CHECK (fulfillment_method IN ('delivery','pickup')), ADD COLUMN delivery_fee_kobo bigint NOT NULL DEFAULT 0 CONSTRAINT orders_delivery_fee_nonnegative CHECK (delivery_fee_kobo >= 0), ADD COLUMN delivery_address text;
CREATE OR REPLACE FUNCTION public.set_outlet_delivery_fee(p_outlet_id uuid, p_fee_kobo bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_outlet_manager(p_outlet_id) OR public.is_central_admin()) THEN RAISE EXCEPTION 'Only this outlet manager or headquarters can adjust delivery fees'; END IF;
 IF p_fee_kobo IS NULL OR p_fee_kobo < 0 OR p_fee_kobo > 9007199254740991 THEN RAISE EXCEPTION 'Enter a valid non-negative delivery fee'; END IF;
 UPDATE public.outlets SET delivery_fee_kobo=p_fee_kobo WHERE id=p_outlet_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outlet not found'; END IF;
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,details) VALUES(auth.uid(),'set_delivery_fee','outlets',p_outlet_id::text,jsonb_build_object('delivery_fee_kobo',p_fee_kobo));
END; $$;
REVOKE ALL ON FUNCTION public.set_outlet_delivery_fee(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_outlet_delivery_fee(uuid,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.place_order_with_fulfillment(p_items jsonb,p_payment_method text,p_fulfillment_method text,p_delivery_address text DEFAULT NULL,p_expected_fee_kobo bigint DEFAULT NULL,p_subscription_id uuid DEFAULT NULL,p_loan_term_days integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_customer uuid:=auth.uid(); v_outlet uuid; v_total bigint:=0; v_food bigint; v_fee bigint:=0; v_order_id uuid; v_ref text; item jsonb; mi record; v_ent record; v_balance bigint; v_avail bigint; v_locked bigint; v_loan_id uuid; v_charge_pct int; v_charge bigint; v_limit bigint; v_reg timestamptz; v_verified text; v_tokens bigint; v_qty int;
BEGIN
 IF v_customer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash_wallet','tokens','subscription_entitlement','food_credit') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
 IF p_fulfillment_method IS NULL OR p_fulfillment_method NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'Choose delivery or pickup'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Order items required'; END IF;
 IF jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Invalid order size'; END IF;
 SELECT outlet_id,created_at,verification_status INTO v_outlet,v_reg,v_verified FROM public.profiles WHERE id=v_customer FOR UPDATE;
 IF v_outlet IS NULL THEN RAISE EXCEPTION 'No outlet assigned'; END IF;
 IF p_fulfillment_method='delivery' THEN
  IF p_delivery_address IS NULL OR length(trim(p_delivery_address))<5 OR length(trim(p_delivery_address))>500 THEN RAISE EXCEPTION 'Enter your delivery address (5–500 characters)'; END IF;
  SELECT delivery_fee_kobo INTO v_fee FROM public.outlets WHERE id=v_outlet FOR SHARE;
  IF p_expected_fee_kobo IS NULL OR p_expected_fee_kobo<>v_fee THEN RAISE EXCEPTION 'The outlet delivery fee changed. Refresh and confirm the new fee'; END IF;
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  v_qty:=(item->>'quantity')::int;
  IF v_qty IS NULL OR v_qty<1 OR v_qty>100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO mi FROM public.menu_items WHERE id=(item->>'menu_item_id')::uuid AND outlet_id=v_outlet AND is_available=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not available at your outlet'; END IF;
  IF p_payment_method='food_credit' AND NOT mi.is_credit_eligible THEN RAISE EXCEPTION 'Item % is not eligible for Eat Now & Pay Later',mi.name; END IF;
  v_total:=v_total+mi.price_kobo*v_qty;
 END LOOP;
 IF v_total<=0 THEN RAISE EXCEPTION 'Order total must be positive'; END IF;
 v_food:=v_total; v_total:=v_total+v_fee; v_order_id:=gen_random_uuid();
 v_ref:='ORD-'||upper(left(replace(gen_random_uuid()::text,'-',''),10));
 IF p_payment_method='cash_wallet' THEN
  SELECT balance_kobo INTO v_balance FROM public.wallets WHERE customer_id=v_customer FOR UPDATE;
  IF v_balance IS NULL OR v_balance<v_total THEN RAISE EXCEPTION 'Insufficient wallet balance including delivery'; END IF;
  UPDATE public.wallets SET balance_kobo=balance_kobo-v_total,updated_at=now() WHERE customer_id=v_customer RETURNING balance_kobo INTO v_balance;
  INSERT INTO public.wallet_ledger(customer_id,tx_type,amount_kobo,balance_after_kobo,reference,description) VALUES(v_customer,'debit',-v_total,v_balance,v_ref,'Food order including delivery fee');
 ELSIF p_payment_method='tokens' THEN
  v_tokens:=(v_total+99)/100;
  SELECT available_tokens,locked_tokens INTO v_avail,v_locked FROM public.token_accounts WHERE customer_id=v_customer FOR UPDATE;
  IF v_avail IS NULL OR v_avail<v_tokens THEN RAISE EXCEPTION 'Insufficient tokens including delivery: need %',v_tokens; END IF;
  UPDATE public.token_accounts SET available_tokens=available_tokens-v_tokens,updated_at=now() WHERE customer_id=v_customer RETURNING available_tokens,locked_tokens INTO v_avail,v_locked;
  INSERT INTO public.token_ledger(customer_id,tx_type,amount,to_available,available_after,locked_after,reference,description) VALUES(v_customer,'spend',v_tokens,-v_tokens,v_avail,v_locked,v_ref,'Food order including delivery paid with tokens');
 ELSIF p_payment_method='subscription_entitlement' THEN
  IF p_subscription_id IS NULL THEN RAISE EXCEPTION 'Subscription required'; END IF;
  PERFORM 1 FROM public.subscriptions WHERE id=p_subscription_id AND customer_id=v_customer AND outlet_id=v_outlet AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active subscription at this outlet required'; END IF;
  SELECT * INTO v_ent FROM public.meal_entitlements WHERE subscription_id=p_subscription_id AND customer_id=v_customer AND service_date=(now() AT TIME ZONE 'Africa/Lagos')::date FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No meal entitlement for today'; END IF;
  IF v_ent.redeemed>=v_ent.allowance THEN RAISE EXCEPTION 'No meals left today'; END IF;
  IF v_fee>0 THEN
   SELECT balance_kobo INTO v_balance FROM public.wallets WHERE customer_id=v_customer FOR UPDATE;
   IF v_balance IS NULL OR v_balance<v_fee THEN RAISE EXCEPTION 'Your wallet needs enough funds for the delivery fee'; END IF;
   UPDATE public.wallets SET balance_kobo=balance_kobo-v_fee,updated_at=now() WHERE customer_id=v_customer RETURNING balance_kobo INTO v_balance;
   INSERT INTO public.wallet_ledger(customer_id,tx_type,amount_kobo,balance_after_kobo,reference,description) VALUES(v_customer,'debit',-v_fee,v_balance,v_ref,'Subscription meal delivery fee');
  END IF;
  UPDATE public.meal_entitlements SET redeemed=redeemed+1 WHERE id=v_ent.id;
  v_total:=v_fee;
 ELSE
  IF now()-v_reg<interval '24 hours' THEN RAISE EXCEPTION 'Eat Now & Pay Later unlocks 24 hours after registration'; END IF;
  IF v_verified<>'verified' THEN RAISE EXCEPTION 'Verify your phone number first'; END IF;
  IF p_loan_term_days IS NULL OR p_loan_term_days NOT IN (7,14,30) THEN RAISE EXCEPTION 'Invalid repayment term'; END IF;
  IF EXISTS(SELECT 1 FROM public.loans WHERE customer_id=v_customer AND status IN ('active','partially_repaid','overdue','under_dispute')) THEN RAISE EXCEPTION 'Repay your outstanding loan before borrowing again'; END IF;
  INSERT INTO public.customer_credit(customer_id) VALUES(v_customer) ON CONFLICT DO NOTHING;
  SELECT credit_limit_kobo-outstanding_kobo INTO v_limit FROM public.customer_credit WHERE customer_id=v_customer FOR UPDATE;
  IF v_total>v_limit THEN RAISE EXCEPTION 'Order including delivery exceeds your available credit'; END IF;
  v_charge_pct:=CASE p_loan_term_days WHEN 7 THEN 15 WHEN 14 THEN 25 ELSE 50 END;
  v_charge:=(v_total*v_charge_pct+99)/100;
  INSERT INTO public.loans(customer_id,outlet_id,principal_kobo,charge_kobo,total_due_kobo,term_days,due_at,status,item_summary) VALUES(v_customer,v_outlet,v_total,v_charge,v_total+v_charge,p_loan_term_days,now()+make_interval(days=>p_loan_term_days),'active',left((SELECT string_agg(m2.name||' x'||it->>'quantity',', ') FROM jsonb_array_elements(p_items) it JOIN public.menu_items m2 ON m2.id=(it->>'menu_item_id')::uuid),300)) RETURNING id INTO v_loan_id;
  UPDATE public.customer_credit SET outstanding_kobo=outstanding_kobo+v_total+v_charge,updated_at=now() WHERE customer_id=v_customer;
 END IF;
 INSERT INTO public.orders(id,customer_id,outlet_id,payment_method,total_kobo,tokens_used,subscription_id,loan_id,status,reference,fulfillment_method,delivery_fee_kobo,delivery_address) VALUES(v_order_id,v_customer,v_outlet,p_payment_method,v_total,v_tokens,CASE WHEN p_payment_method='subscription_entitlement' THEN p_subscription_id ELSE NULL END,v_loan_id,'confirmed',v_ref,p_fulfillment_method,v_fee,CASE WHEN p_fulfillment_method='delivery' THEN trim(p_delivery_address) ELSE NULL END);
 UPDATE public.wallet_ledger SET related_order_id=v_order_id WHERE customer_id=v_customer AND reference=v_ref AND tx_type='debit';
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT name,price_kobo INTO mi FROM public.menu_items WHERE id=(item->>'menu_item_id')::uuid;
  INSERT INTO public.order_items(order_id,menu_item_id,item_name,unit_price_kobo,quantity) VALUES(v_order_id,(item->>'menu_item_id')::uuid,mi.name,mi.price_kobo,(item->>'quantity')::int);
 END LOOP;
 PERFORM public.unlock_referral_reward(v_customer);
 INSERT INTO public.notifications(customer_id,title,body) VALUES(v_customer,'Order placed','Order '||v_ref||' confirmed for '||p_fulfillment_method||'.');
 RETURN jsonb_build_object('order_id',v_order_id,'reference',v_ref,'total_kobo',v_total,'delivery_fee_kobo',v_fee,'loan_id',v_loan_id);
END; $$;
REVOKE ALL ON FUNCTION public.place_order_with_fulfillment(jsonb,text,text,text,bigint,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order_with_fulfillment(jsonb,text,text,text,bigint,uuid,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.refund_subscription_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.status='confirmed' AND NEW.status='cancelled' AND OLD.payment_method='subscription_entitlement' AND OLD.delivery_fee_kobo>0 THEN
  PERFORM public.apply_wallet_refund(OLD.customer_id,OLD.delivery_fee_kobo,'DELIVERY-REFUND-'||OLD.id::text,OLD.id);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER refund_subscription_delivery AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.refund_subscription_delivery();