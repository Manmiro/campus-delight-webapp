CREATE TABLE public.gift_payments (
  reference text PRIMARY KEY CHECK (reference ~ '^CDG-[a-f0-9-]{36}$'),
  customer_id uuid NOT NULL REFERENCES public.profiles(id),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id),
  kind text NOT NULL CHECK (kind IN ('wallet','plan','meal')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo BETWEEN 10000 AND 100000000),
  sponsor_name text NOT NULL CHECK (length(sponsor_name) BETWEEN 1 AND 80),
  sponsor_email text NOT NULL CHECK (length(sponsor_email) BETWEEN 3 AND 254),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  selection jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success')),
  wallet_fallback boolean NOT NULL DEFAULT false,
  related_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
REVOKE ALL ON public.gift_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.gift_payments TO service_role;
ALTER TABLE public.gift_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX gift_payments_customer_idx ON public.gift_payments(customer_id);

CREATE OR REPLACE FUNCTION public.prepare_gift_payment(p_reference text, p_input jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; o record; mi record; v_price bigint; v_fee bigint := 0; v_selection jsonb := '{}';
BEGIN
  SELECT * INTO p FROM public.profiles WHERE customer_code = p_input->>'foodieId' AND is_active FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p.id AND role = 'customer') THEN
    RAISE EXCEPTION 'Recipient not available';
  END IF;
  SELECT * INTO o FROM public.outlets WHERE id = p.outlet_id AND status = 'active' FOR SHARE;
  IF NOT FOUND OR o.id IS DISTINCT FROM (p_input->>'outletId')::uuid THEN RAISE EXCEPTION 'Recipient outlet changed. Verify the Foodie ID again'; END IF;
  IF p_input->>'kind' = 'wallet' THEN
    v_price := (p_input->>'expectedAmountKobo')::bigint;
  ELSIF p_input->>'kind' = 'plan' THEN
    SELECT price_kobo INTO v_price FROM public.outlet_plan_prices
      WHERE outlet_id = o.id AND plan = p_input->>'plan' AND tier = p_input->>'tier' AND is_active FOR SHARE;
    IF NOT FOUND OR v_price <= 0 THEN RAISE EXCEPTION 'Plan is unavailable'; END IF;
    v_selection := jsonb_build_object('plan',p_input->>'plan','tier',p_input->>'tier');
  ELSIF p_input->>'kind' = 'meal' THEN
    SELECT * INTO mi FROM public.menu_items WHERE id = (p_input->>'menuItemId')::uuid AND outlet_id = o.id AND is_available FOR SHARE;
    IF NOT FOUND OR mi.price_kobo <= 0 THEN RAISE EXCEPTION 'Meal is unavailable'; END IF;
    IF p_input->>'fulfillment' IS NULL OR p_input->>'fulfillment' NOT IN ('pickup','delivery') THEN RAISE EXCEPTION 'Choose delivery or pickup'; END IF;
    IF p_input->>'fulfillment' = 'delivery' THEN
      IF length(trim(coalesce(p_input->>'address',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Enter a campus delivery address'; END IF;
      v_fee := o.delivery_fee_kobo;
    END IF;
    v_price := mi.price_kobo + v_fee;
    v_selection := jsonb_build_object('menuItemId',mi.id,'name',mi.name,'foodKobo',mi.price_kobo,
      'fulfillment',p_input->>'fulfillment','deliveryFeeKobo',v_fee,
      'address',CASE WHEN p_input->>'fulfillment' = 'delivery' THEN trim(p_input->>'address') ELSE NULL END);
  ELSE RAISE EXCEPTION 'Choose a gift'; END IF;
  IF v_price IS NULL OR v_price IS DISTINCT FROM (p_input->>'expectedAmountKobo')::bigint THEN RAISE EXCEPTION 'Price changed. Verify the recipient again to refresh prices'; END IF;
  INSERT INTO public.gift_payments(reference,customer_id,outlet_id,kind,amount_kobo,sponsor_name,sponsor_email,note,selection)
    VALUES(p_reference,p.id,o.id,p_input->>'kind',v_price,trim(p_input->>'sponsorName'),trim(p_input->>'sponsorEmail'),coalesce(p_input->>'note',''),v_selection);
  RETURN v_price;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_gift_payment(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_gift_payment(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_verified_gift(p_reference text,p_amount_kobo bigint,p_currency text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; v_related uuid; v_fallback boolean := false; v_start date; v_end date; v_today date := (now() AT TIME ZONE 'Africa/Lagos')::date;
BEGIN
  SELECT * INTO g FROM public.gift_payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied',false,'status','unknown_reference'); END IF;
  IF p_currency IS DISTINCT FROM 'NGN' OR p_amount_kobo IS DISTINCT FROM g.amount_kobo
    OR p_payload->>'status' IS DISTINCT FROM 'success' OR p_payload->>'reference' IS DISTINCT FROM p_reference THEN
    RETURN jsonb_build_object('applied',false,'status','verification_mismatch');
  END IF;
  IF g.status = 'success' THEN RETURN jsonb_build_object('applied',true,'status','success','already',true,'kind',g.kind,'walletFallback',g.wallet_fallback); END IF;
  PERFORM 1 FROM public.profiles WHERE id = g.customer_id AND is_active AND outlet_id = g.outlet_id FOR SHARE;
  v_fallback := NOT FOUND;
  PERFORM 1 FROM public.outlets WHERE id = g.outlet_id AND status = 'active' FOR SHARE;
  v_fallback := v_fallback OR NOT FOUND;
  IF g.kind = 'meal' AND NOT v_fallback THEN
    PERFORM 1 FROM public.menu_items WHERE id = (g.selection->>'menuItemId')::uuid AND outlet_id = g.outlet_id AND is_available FOR SHARE;
    v_fallback := NOT FOUND;
  END IF;
  IF g.kind = 'wallet' OR v_fallback THEN
    PERFORM public.apply_wallet_funding(g.customer_id,g.amount_kobo,p_reference);
  ELSIF g.kind = 'plan' THEN
    IF g.selection->>'plan' = 'weekend' THEN
      v_start := v_today + ((5 - extract(dow FROM v_today)::int + 7) % 7);
      v_end := v_start + 2;
    ELSIF g.selection->>'plan' = 'weekly' THEN v_start := v_today; v_end := v_start + 6;
    ELSE v_start := v_today; v_end := (date_trunc('month',v_today) + interval '1 month - 1 day')::date;
    END IF;
    INSERT INTO public.subscriptions(customer_id,outlet_id,plan,tier,price_kobo,status,start_date,end_date,payment_reference,activated_at)
      VALUES(g.customer_id,g.outlet_id,g.selection->>'plan',g.selection->>'tier',g.amount_kobo,'active',v_start,v_end,p_reference,now()) RETURNING id INTO v_related;
    INSERT INTO public.meal_entitlements(subscription_id,customer_id,service_date,allowance)
      SELECT v_related,g.customer_id,d::date,CASE g.selection->>'tier' WHEN 'basic' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END
      FROM generate_series(v_start::timestamp,v_end::timestamp,interval '1 day') d;
  ELSE
    BEGIN
      INSERT INTO public.orders(customer_id,outlet_id,payment_method,total_kobo,status,reference,fulfillment_method,delivery_fee_kobo,delivery_address)
        VALUES(g.customer_id,g.outlet_id,'card',g.amount_kobo,'confirmed',p_reference,g.selection->>'fulfillment',
          (g.selection->>'deliveryFeeKobo')::bigint,g.selection->>'address') RETURNING id INTO v_related;
      INSERT INTO public.order_items(order_id,menu_item_id,item_name,unit_price_kobo,quantity)
        VALUES(v_related,(g.selection->>'menuItemId')::uuid,g.selection->>'name',(g.selection->>'foodKobo')::bigint,1);
      PERFORM public.unlock_referral_reward(g.customer_id);
    EXCEPTION WHEN raise_exception THEN
      v_fallback := true; v_related := NULL;
      PERFORM public.apply_wallet_funding(g.customer_id,g.amount_kobo,p_reference);
    END;
  END IF;
  INSERT INTO public.notifications(customer_id,title,body) VALUES(g.customer_id,'A gift from ' || g.sponsor_name,
    CASE WHEN v_fallback THEN 'Your gift payment was credited to your wallet.' WHEN g.kind = 'wallet' THEN 'Your wallet was funded.'
      WHEN g.kind = 'plan' THEN 'Your meal plan is active.' ELSE 'A Surprise Gift meal is with your campus kitchen.' END
    || CASE WHEN g.note <> '' THEN ' Message: ' || g.note ELSE '' END);
  UPDATE public.gift_payments SET status = 'success',verified_at = now(),payload = p_payload,related_id = v_related,wallet_fallback = v_fallback WHERE reference = p_reference;
  RETURN jsonb_build_object('applied',true,'status','success','already',false,'kind',g.kind,'walletFallback',v_fallback);
END; $$;
REVOKE ALL ON FUNCTION public.settle_verified_gift(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_verified_gift(text,bigint,text,jsonb) TO service_role;