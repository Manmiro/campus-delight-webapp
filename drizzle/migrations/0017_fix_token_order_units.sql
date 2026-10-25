CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_payment_method text, p_subscription_id uuid DEFAULT NULL::uuid, p_loan_term_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer uuid := auth.uid();
  v_outlet uuid;
  v_total bigint := 0;
  v_order_id uuid;
  v_ref text;
  item jsonb;
  mi record;
  v_ent record;
  v_balance bigint;
  v_avail bigint; v_locked bigint;
  v_loan_id uuid;
  v_charge_pct int;
  v_charge bigint;
  v_limit bigint;
  v_outstanding bigint;
  v_eligible boolean;
  v_reg timestamptz;
  v_verified text;
  v_tokens bigint;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if p_payment_method not in ('cash_wallet','tokens','subscription_entitlement','food_credit') then
    raise exception 'Invalid payment method';
  end if;
  if p_payment_method = 'food_credit' and p_loan_term_days is null then
    raise exception 'Repayment term required for food credit';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Order is empty'; end if;

  select outlet_id into v_outlet from public.profiles where id = v_customer;
  if v_outlet is null then raise exception 'No outlet assigned'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into mi from public.menu_items
      where id = (item->>'menu_item_id')::uuid and outlet_id = v_outlet and is_available = true;
    if not found then raise exception 'Menu item not available at your outlet'; end if;
    if p_payment_method = 'food_credit' and mi.is_credit_eligible = false then
      raise exception 'Item % is not eligible for Eat Now && Pay Later', mi.name;
    end if;
    v_total := v_total + mi.price_kobo * coalesce((item->>'quantity')::int, 1);
  end loop;
  if v_total <= 0 then raise exception 'Order total must be positive'; end if;

  v_ref := 'ORD-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));

  if p_payment_method = 'cash_wallet' then
    select balance_kobo into v_balance from public.wallets where customer_id = v_customer for update;
    if v_balance < v_total then raise exception 'Insufficient wallet balance'; end if;
    update public.wallets set balance_kobo = balance_kobo - v_total, updated_at = now()
      where customer_id = v_customer returning balance_kobo into v_balance;
    insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, related_order_id, description)
      values (v_customer, 'debit', -(v_total), v_balance, v_ref, null, 'Food order payment');

  elsif p_payment_method = 'tokens' then
    v_tokens := (v_total + 99) / 100; -- 1 token = ₦1 = 100 kobo
    select available_tokens, locked_tokens into v_avail, v_locked from public.token_accounts where customer_id = v_customer for update;
    if v_avail < v_tokens then raise exception 'Insufficient tokens: need %, have %', v_tokens, v_avail; end if;
    update public.token_accounts set available_tokens = available_tokens - v_tokens, updated_at = now()
      where customer_id = v_customer returning available_tokens, locked_tokens into v_avail, v_locked;
    insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
      values (v_customer, 'spend', v_tokens, -(v_tokens), v_avail, v_locked, v_ref, 'Food order paid with tokens');

  elsif p_payment_method = 'subscription_entitlement' then
    if p_subscription_id is null then raise exception 'Subscription required'; end if;
    select * into v_ent from public.meal_entitlements
      where subscription_id = p_subscription_id and customer_id = v_customer
        and service_date = (now() at time zone 'Africa/Lagos')::date
      for update;
    if not found then raise exception 'No meal entitlement for today'; end if;
    if v_ent.redeemed >= v_ent.allowance then raise exception 'No meals left today'; end if;
    update public.meal_entitlements set redeemed = redeemed + 1 where id = v_ent.id;
    v_total := 0;

  else -- food_credit
    select created_at into v_reg from public.profiles where id = v_customer;
    select verification_status into v_verified from public.profiles where id = v_customer;
    if now() - v_reg < interval '24 hours' then raise exception 'Eat Now && Pay Later unlocks 24 hours after registration'; end if;
    if v_verified <> 'verified' then raise exception 'Verify your phone number first'; end if;
    if p_loan_term_days not in (7,14,30) then raise exception 'Invalid repayment term'; end if;
    if exists (select 1 from public.loans where customer_id = v_customer and status in ('active','partially_repaid','overdue','under_dispute')) then
      raise exception 'You have an outstanding loan — repay it before borrowing again';
    end if;
    insert into public.customer_credit (customer_id) values (v_customer) on conflict do nothing;
    select credit_limit_kobo - outstanding_kobo into v_limit from public.customer_credit where customer_id = v_customer for update;
    if v_total > v_limit then raise exception 'Order exceeds your available credit (₦%)', (v_limit / 100.0)::int; end if;
    v_charge_pct := case p_loan_term_days when 7 then 15 when 14 then 25 else 50 end;
    v_charge := (v_total * v_charge_pct + 99) / 100;
    insert into public.loans (customer_id, outlet_id, principal_kobo, charge_kobo, total_due_kobo, term_days, due_at, status, item_summary)
      values (v_customer, v_outlet, v_total, v_charge, v_total + v_charge, p_loan_term_days,
        now() + make_interval(days => p_loan_term_days), 'active',
        left((select string_agg(m2.name || ' x' || coalesce(it->>'quantity','1'), ', ') from jsonb_array_elements(p_items) it join public.menu_items m2 on m2.id = (it->>'menu_item_id')::uuid), 300))
      returning id into v_loan_id;
    update public.customer_credit set outstanding_kobo = outstanding_kobo + v_total + v_charge, updated_at = now()
      where customer_id = v_customer;
  end if;

  insert into public.orders (customer_id, outlet_id, payment_method, total_kobo, tokens_used, subscription_id, loan_id, status, reference)
    values (v_customer, v_outlet, p_payment_method, v_total,
      case when p_payment_method = 'tokens' then v_tokens else null end,
      case when p_payment_method = 'subscription_entitlement' then p_subscription_id else null end,
      v_loan_id, 'confirmed', v_ref)
    returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    select name, price_kobo into mi from public.menu_items where id = (item->>'menu_item_id')::uuid;
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price_kobo, quantity)
      values (v_order_id, (item->>'menu_item_id')::uuid, mi.name, mi.price_kobo, coalesce((item->>'quantity')::int, 1));
  end loop;

  perform public.unlock_referral_reward(v_customer);

  insert into public.notifications (customer_id, title, body)
    values (v_customer, 'Order placed', 'Order ' || v_ref || ' confirmed at your outlet.');

  return jsonb_build_object('order_id', v_order_id, 'reference', v_ref, 'total_kobo', v_total, 'loan_id', v_loan_id);
end;
$function$;