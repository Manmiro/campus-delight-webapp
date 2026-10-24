create or replace function public.get_config(_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.system_config where key = _key
$$;

-- ============ TOKEN TRANSFERS ============
create or replace function public.transfer_tokens(p_recipient_identifier text, p_principal bigint, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid := auth.uid();
  v_sender_outlet uuid;
  v_recipient public.profiles%rowtype;
  v_rec_avail bigint;
  v_rec_locked bigint;
  v_available bigint;
  v_locked bigint;
  v_fee bigint;
  v_sent_today bigint;
  v_ref text;
begin
  if v_sender is null then raise exception 'Not authenticated'; end if;
  if p_principal is null or p_principal <= 0 then raise exception 'Invalid transfer amount'; end if;

  select outlet_id into v_sender_outlet from public.profiles where id = v_sender;
  select * into v_recipient from public.profiles
    where upper(customer_code) = upper(btrim(p_recipient_identifier))
       or lower(email) = lower(btrim(p_recipient_identifier))
    limit 1;
  if not found then raise exception 'Recipient not found. Check the customer ID or email.'; end if;
  if v_recipient.id = v_sender then raise exception 'You cannot transfer tokens to yourself'; end if;
  if v_recipient.outlet_id is distinct from v_sender_outlet then
    raise exception 'Cross-outlet transfers are not allowed';
  end if;

  select coalesce((value->>'fee')::bigint, 10) into v_fee from public.system_config where key = 'token_transfer';

  select coalesce(sum(principal_tokens), 0) into v_sent_today from public.token_transfers
    where sender_id = v_sender and status = 'success'
      and (created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date;
  if v_sent_today + p_principal > 500 then
    raise exception 'Daily limit exceeded: you can transfer at most % more token(s) today', greatest(500 - v_sent_today, 0);
  end if;

  select available_tokens, locked_tokens into v_available, v_locked
    from public.token_accounts where customer_id = v_sender for update;
  if v_available < p_principal + v_fee then
    raise exception 'Insufficient available tokens: need % (principal + fee), have %', p_principal + v_fee, v_available;
  end if;

  v_ref := coalesce(p_reference, 'TRF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)));

  insert into public.token_transfers (sender_id, recipient_id, principal_tokens, fee_tokens, status, reference)
    values (v_sender, v_recipient.id, p_principal, v_fee, 'success', v_ref)
    returning id into v_ref;

  update public.token_accounts
    set available_tokens = available_tokens - (p_principal + v_fee), updated_at = now()
    where customer_id = v_sender
    returning available_tokens, locked_tokens into v_available, v_locked;

  insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, related_transfer_id, related_customer_id, description) values
    (v_sender, 'transfer_out', p_principal, -(p_principal), v_available, v_locked, v_ref, null, v_recipient.id, 'Token transfer sent: ' || p_principal || ' tokens'),
    (v_sender, 'transfer_fee', v_fee, -(v_fee), v_available, v_locked, v_ref, null, null, 'Transfer fee: ' || v_fee || ' tokens');

  update public.token_accounts
    set available_tokens = available_tokens + p_principal, updated_at = now()
    where customer_id = v_recipient.id
    returning available_tokens, locked_tokens into v_rec_avail, v_rec_locked;

  insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, related_transfer_id, related_customer_id, description) values
    (v_recipient.id, 'transfer_in', p_principal, p_principal, v_rec_avail, v_rec_locked, v_ref, null, v_sender, 'Token transfer received: ' || p_principal || ' tokens');

  insert into public.notifications (customer_id, title, body) values
    (v_sender, 'Tokens sent', 'You sent ' || p_principal || ' tokens (fee ' || v_fee || '). Ref ' || v_ref),
    (v_recipient.id, 'Tokens received', 'You received ' || p_principal || ' tokens. Ref ' || v_ref);

  return jsonb_build_object('reference', v_ref, 'principal', p_principal, 'fee', v_fee, 'recipient', v_recipient.full_name);
end;
$$;

-- ============ WALLET FUNDING (idempotent, called after Paystack verification) ============
create or replace function public.apply_wallet_funding(p_customer_id uuid, p_amount_kobo bigint, p_reference text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'Invalid amount'; end if;
  if exists (select 1 from public.wallet_ledger where reference = p_reference and tx_type = 'funding') then
    return false; -- already applied (idempotent)
  end if;
  update public.wallets
    set balance_kobo = balance_kobo + p_amount_kobo, updated_at = now()
    where customer_id = p_customer_id
    returning balance_kobo into v_balance;
  if not found then raise exception 'Wallet not found'; end if;
  insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description)
    values (p_customer_id, 'funding', p_amount_kobo, v_balance, p_reference, 'Wallet funding via Paystack');
  insert into public.notifications (customer_id, title, body)
    values (p_customer_id, 'Wallet funded', '₦' || (p_amount_kobo / 100.0)::text || ' added to your wallet. Ref ' || p_reference);
  return true;
end;
$$;

-- ============ REFERRALS ============
create or replace function public.lock_referral_reward(p_referrer_id uuid, p_referred_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reward bigint;
  v_avail bigint; v_locked bigint;
begin
  if p_referrer_id = p_referred_id then return; end if;
  if exists (select 1 from public.referrals where referred_id = p_referred_id) then return; end if; -- no duplicate rewards
  select coalesce((value->>'reward_tokens')::bigint, 100) into v_reward from public.system_config where key = 'referral';
  insert into public.referrals (referrer_id, referred_id, status, locked_tokens)
    values (p_referrer_id, p_referred_id, 'locked', v_reward);
  select available_tokens, locked_tokens into v_avail, v_locked
    from public.token_accounts where customer_id = p_referrer_id for update;
  update public.token_accounts set locked_tokens = locked_tokens + v_reward, updated_at = now()
    where customer_id = p_referrer_id;
  insert into public.token_ledger (customer_id, tx_type, amount, to_available, to_locked, available_after, locked_after, reference, related_customer_id, description)
    values (p_referrer_id, 'referral_locked', v_reward, 0, v_reward, v_avail, v_locked + v_reward,
      'REF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), p_referred_id,
      'Referral reward locked: ' || v_reward || ' tokens');
  insert into public.notifications (customer_id, title, body)
    values (p_referrer_id, 'Referral registered', 'Your referral registered. ' || v_reward || ' tokens are locked until their first order.');
end;
$$;

create or replace function public.unlock_referral_reward(p_referred_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_avail bigint; v_locked bigint;
begin
  select * into r from public.referrals
    where referred_id = p_referred_id and status = 'locked'
    for update;
  if not found then return; end if; -- idempotent
  update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id;
  select available_tokens, locked_tokens into v_avail, v_locked
    from public.token_accounts where customer_id = r.referrer_id for update;
  update public.token_accounts
    set available_tokens = available_tokens + r.locked_tokens, locked_tokens = locked_tokens - r.locked_tokens, updated_at = now()
    where customer_id = r.referrer_id;
  insert into public.token_ledger (customer_id, tx_type, amount, to_available, to_locked, available_after, locked_after, reference, related_customer_id, description)
    values (r.referrer_id, 'referral_unlock', r.locked_tokens, r.locked_tokens, -(r.locked_tokens), v_avail + r.locked_tokens, v_locked - r.locked_tokens,
      'REFU-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), p_referred_id,
      'Referral reward unlocked: ' || r.locked_tokens || ' tokens');
  insert into public.notifications (customer_id, title, body)
    values (r.referrer_id, 'Referral reward unlocked', 'Your ' || r.locked_tokens || ' referral tokens are now available.');
end;
$$;

-- ============ SUBSCRIPTION ACTIVATION (idempotent) ============
create or replace function public.activate_subscription(p_subscription_id uuid, p_reference text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_start date;
  v_end date;
  d date;
begin
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if s.status = 'active' then return false; end if; -- idempotent
  if s.status not in ('awaiting_payment','renewal_pending') then raise exception 'Subscription cannot be activated from status %', s.status; end if;

  if s.plan = 'weekend' then
    v_start := ((now() at time zone 'Africa/Lagos')::date + ((6 - extract(dow from (now() at time zone 'Africa/Lagos')::date)::int + 7) % 7));
    if extract(dow from (now() at time zone 'Africa/Lagos')::date) = 5 then v_start := (now() at time zone 'Africa/Lagos')::date; end if;
    v_end := v_start + 2; -- Friday..Sunday
  elsif s.plan = 'weekly' then
    v_start := (now() at time zone 'Africa/Lagos')::date;
    v_end := v_start + 6;
  else
    v_start := (now() at time zone 'Africa/Lagos')::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
  end if;

  update public.subscriptions
    set status = 'active', start_date = v_start, end_date = v_end, activated_at = now(), payment_reference = p_reference
    where id = s.id;

  d := v_start;
  while d <= v_end loop
    if s.plan = 'weekend' and extract(dow from d) not in (5,6,0) then
      d := d + 1; continue;
    end if;
    insert into public.meal_entitlements (subscription_id, customer_id, service_date, allowance)
      values (s.id, s.customer_id, d,
        case s.tier when 'basic' then 1 when 'standard' then 2 else 3 end)
      on conflict (subscription_id, service_date) do nothing;
    d := d + 1;
  end loop;

  insert into public.notifications (customer_id, title, body)
    values (s.customer_id, 'Subscription active', 'Your ' || s.plan || ' (' || s.tier || ') subscription is active until ' || v_end::text || '.');
  return true;
end;
$$;

-- ============ ORDER PLACEMENT ============
create or replace function public.place_order(p_items jsonb, p_payment_method text, p_subscription_id uuid default null, p_loan_term_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    select available_tokens, locked_tokens into v_avail, v_locked from public.token_accounts where customer_id = v_customer for update;
    if v_avail < v_total then raise exception 'Insufficient tokens: need %, have %', v_total / 100, v_avail; end if;
    update public.token_accounts set available_tokens = available_tokens - v_total, updated_at = now()
      where customer_id = v_customer returning available_tokens, locked_tokens into v_avail, v_locked;
    insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
      values (v_customer, 'spend', v_total, -(v_total), v_avail, v_locked, v_ref, 'Food order paid with tokens');

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
    v_charge := (v_total * v_charge_pct + 99) / 100; -- exact kobo, round up only the kobo fraction
    insert into public.loans (customer_id, outlet_id, principal_kobo, charge_kobo, total_due_kobo, term_days, due_at, status, item_summary)
      values (v_customer, v_outlet, v_total, v_charge, v_total + v_charge, p_loan_term_days,
        now() + make_interval(days => p_loan_term_days), 'active',
        left((select string_agg(mi.name || ' x' || coalesce(it->>'quantity','1'), ', ') from jsonb_array_elements(p_items) it join public.menu_items mi on mi.id = (it->>'menu_item_id')::uuid), 300))
      returning id into v_loan_id;
    update public.customer_credit set outstanding_kobo = outstanding_kobo + v_total + v_charge, updated_at = now()
      where customer_id = v_customer;
  end if;

  insert into public.orders (customer_id, outlet_id, payment_method, total_kobo, tokens_used, subscription_id, loan_id, status, reference)
    values (v_customer, v_outlet, p_payment_method, v_total,
      case when p_payment_method = 'tokens' then v_total else null end,
      case when p_payment_method = 'subscription_entitlement' then p_subscription_id else null end,
      v_loan_id, 'confirmed', v_ref)
    returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    select name, price_kobo into mi from public.menu_items where id = (item->>'menu_item_id')::uuid;
    insert into public.order_items (order_id, menu_item_id, item_name, unit_price_kobo, quantity)
      values (v_order_id, (item->>'menu_item_id')::uuid, mi.name, mi.price_kobo, coalesce((item->>'quantity')::int, 1));
  end loop;

  -- first qualifying order unlocks referral reward
  perform public.unlock_referral_reward(v_customer);

  insert into public.notifications (customer_id, title, body)
    values (v_customer, 'Order placed', 'Order ' || v_ref || ' confirmed at your outlet.');

  return jsonb_build_object('order_id', v_order_id, 'reference', v_ref, 'total_kobo', v_total, 'loan_id', v_loan_id);
end;
$$;

-- ============ LOAN REPAYMENT ============
create or replace function public.repay_loan(p_loan_id uuid, p_amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  l record;
  v_paid bigint;
  v_balance bigint;
  v_outstanding bigint;
  v_ref text;
  v_prev_limit bigint;
  v_new_limit bigint;
  v_adj text;
  v_overdue bigint := 0;
  v_hours_late int;
  v_conf jsonb;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 then raise exception 'Invalid repayment amount'; end if;
  select * into l from public.loans where id = p_loan_id and customer_id = v_customer for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status in ('fully_repaid_on_time','fully_repaid_late','cancelled','written_off') then raise exception 'Loan already settled'; end if;

  select balance_kobo into v_balance from public.wallets where customer_id = v_customer for update;
  if v_balance < p_amount_kobo then raise exception 'Insufficient wallet balance'; end if;
  update public.wallets set balance_kobo = balance_kobo - p_amount_kobo, updated_at = now()
    where customer_id = v_customer returning balance_kobo into v_balance;
  v_ref := 'REP-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, related_loan_id, description)
    values (v_customer, 'debit', -(p_amount_kobo), v_balance, v_ref, l.id, 'Loan repayment');
  insert into public.loan_repayments (loan_id, customer_id, amount_kobo, method, status, reference)
    values (l.id, v_customer, p_amount_kobo, 'cash_wallet', 'successful', v_ref);

  -- outstanding = total due + overdue charges - successful repayments (only successful, idempotent by unique reference)
  select coalesce(sum(amount_kobo), 0) into v_paid from public.loan_repayments where loan_id = l.id and status = 'successful';
  v_outstanding := l.total_due_kobo + v_overdue - v_paid;
  if v_outstanding < 0 then v_outstanding := 0; end if;

  if v_outstanding = 0 then
    if now() <= l.due_at then
      update public.loans set status = 'fully_repaid_on_time', settled_at = now() where id = l.id;
      select * into v_conf from jsonb_each_text(public.get_config('food_credit')); -- placeholder; real read below
      v_prev_limit := (select credit_limit_kobo from public.customer_credit where customer_id = v_customer);
      v_new_limit := v_prev_limit * 2;
      v_adj := 'timely_double';
    else
      update public.loans set status = 'fully_repaid_late', settled_at = now() where id = l.id;
      v_prev_limit := (select credit_limit_kobo from public.customer_credit where customer_id = v_customer);
      v_new_limit := floor(v_prev_limit::numeric * 0.70)::bigint; -- exact 30% reduction, no rounding to nice numbers
      v_adj := 'untimely_reduce';
    end if;
    update public.customer_credit set credit_limit_kobo = v_new_limit, updated_at = now() where customer_id = v_customer;
    insert into public.credit_limit_history (customer_id, previous_limit_kobo, new_limit_kobo, adjustment_type, trigger_loan_id, notes)
      values (v_customer, v_prev_limit, v_new_limit, v_adj, l.id, case when v_adj = 'timely_double' then 'Timely full repayment: limit doubled' else 'Late full repayment: limit reduced by exactly 30%' end);
    insert into public.notifications (customer_id, title, body)
      values (v_customer, 'Loan settled', case when v_adj = 'timely_double' then 'Loan settled on time. Your credit limit doubled to ₦' || (v_new_limit / 100.0)::text else 'Loan settled late. Your credit limit is now ₦' || (v_new_limit / 100.0)::text end);
  else
    if now() > l.due_at then
      update public.loans set status = 'overdue' where id = l.id;
    else
      update public.loans set status = 'partially_repaid' where id = l.id;
    end if;
    insert into public.notifications (customer_id, title, body)
      values (v_customer, 'Repayment received', '₦' || (p_amount_kobo / 100.0)::text || ' applied. Outstanding: ₦' || (v_outstanding / 100.0)::text);
  end if;

  update public.customer_credit set outstanding_kobo = greatest(v_outstanding, 0), updated_at = now() where customer_id = v_customer;

  return jsonb_build_object('reference', v_ref, 'outstanding_kobo', v_outstanding, 'status', case when v_outstanding = 0 then v_adj else 'partially_repaid' end);
end;
$$;

-- ============ OUTLET TRANSFER APPLICATION ============
create or replace function public.apply_outlet_transfer(p_to_outlet_id uuid, p_fee_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_from uuid;
  v_fee bigint;
  v_this_month int;
  v_ref text;
  v_balance bigint;
  v_avail bigint; v_locked bigint;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if p_fee_method not in ('cash','tokens') then raise exception 'Choose one payment method: cash or tokens'; end if;
  select outlet_id into v_from from public.profiles where id = v_customer;
  if v_from = p_to_outlet_id then raise exception 'You are already assigned to that outlet'; end if;
  if not exists (select 1 from public.outlets where id = p_to_outlet_id and status = 'active') then raise exception 'Destination outlet is not active'; end if;

  v_this_month := (select count(*) from public.outlet_transfer_applications
    where customer_id = v_customer
      and (created_at at time zone 'Africa/Lagos')::date >= date_trunc('month', (now() at time zone 'Africa/Lagos')::date)
      and status <> 'withdrawn');
  if v_this_month >= 1 then raise exception 'You can submit only one outlet-transfer application per month'; end if;

  v_fee := coalesce((public.get_config('outlet_transfer_fee') ->> (case p_fee_method when 'cash' then 'cash_kobo' else 'tokens' end))::bigint, 0);

  if p_fee_method = 'cash' then
    select balance_kobo into v_balance from public.wallets where customer_id = v_customer for update;
    if v_balance < v_fee then raise exception 'Insufficient wallet balance for the ₦500 fee'; end if;
    update public.wallets set balance_kobo = balance_kobo - v_fee, updated_at = now()
      where customer_id = v_customer returning balance_kobo into v_balance;
    insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, description)
      values (v_customer, 'fee', -(v_fee), v_balance, 'OTF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Outlet transfer application fee');
  else
    select available_tokens, locked_tokens into v_avail, v_locked from public.token_accounts where customer_id = v_customer for update;
    if v_avail < v_fee then raise exception 'Insufficient available tokens for the 500-token fee'; end if;
    update public.token_accounts set available_tokens = available_tokens - v_fee, updated_at = now()
      where customer_id = v_customer returning available_tokens, locked_tokens into v_avail, v_locked;
    insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
      values (v_customer, 'spend', v_fee, -(v_fee), v_avail, v_locked, 'OTF-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Outlet transfer application fee');
  end if;

  v_ref := 'OTA-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  insert into public.outlet_transfer_applications (customer_id, from_outlet_id, to_outlet_id, fee_method, fee_amount, status, reference)
    values (v_customer, v_from, p_to_outlet_id, p_fee_method, v_fee, 'submitted', v_ref);

  insert into public.notifications (customer_id, title, body)
    values (v_customer, 'Transfer application submitted', 'Application ' || v_ref || ' is awaiting headquarters review. The fee is non-refundable once submitted.');

  return jsonb_build_object('reference', v_ref, 'fee', v_fee, 'fee_method', p_fee_method);
end;
$$;

-- ============ OTP ============
create or replace function public.request_otp(p_purpose text default 'food_credit')
returns text language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_code text;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.otp_codes where customer_id = v_customer and created_at > now() - interval '60 seconds') then
    raise exception 'Please wait before requesting another code';
  end if;
  v_code := lpad((floor(random() * 100000))::int::text, 5, '0');
  insert into public.otp_codes (customer_id, code_hash, purpose, expires_at)
    values (v_customer, encode(sha256(convert_to(v_code || ':' || v_customer::text, 'utf8')), 'hex'), p_purpose, now() + interval '5 minutes');
  return v_code; -- demo: SMS delivery not yet configured; replace with SMS gateway call
end;
$$;

create or replace function public.verify_otp(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  o record;
begin
  if v_customer is null then raise exception 'Not authenticated'; end if;
  select * into o from public.otp_codes
    where customer_id = v_customer and consumed = false and purpose = 'food_credit'
    order by created_at desc limit 1 for update;
  if not found then raise exception 'No active code. Request a new one.'; end if;
  if o.failed_attempts >= 5 then raise exception 'Too many failed attempts. Request a new code.'; end if;
  if o.expires_at < now() then raise exception 'Code expired. Request a new one.'; end if;
  if encode(sha256(convert_to(btrim(p_code) || ':' || v_customer::text, 'utf8')), 'hex') <> o.code_hash then
    update public.otp_codes set failed_attempts = failed_attempts + 1 where id = o.id;
    raise exception 'Incorrect code';
  end if;
  update public.otp_codes set consumed = true where id = o.id;
  update public.profiles set verification_status = 'verified' where id = v_customer;
  return true;
end;
$$;

-- ============ ADMIN: manual credit-limit adjustment (audited) ============
create or replace function public.admin_adjust_credit_limit(p_customer uuid, p_new_limit_kobo bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_prev bigint;
begin
  if not public.is_central_admin() then raise exception 'Forbidden'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required'; end if;
  select credit_limit_kobo into v_prev from public.customer_credit where customer_id = p_customer;
  if v_prev is null then raise exception 'Customer has no credit account'; end if;
  update public.customer_credit set credit_limit_kobo = p_new_limit_kobo, updated_at = now() where customer_id = p_customer;
  insert into public.credit_limit_history (customer_id, previous_limit_kobo, new_limit_kobo, adjustment_type, notes)
    values (p_customer, v_prev, p_new_limit_kobo, 'manual', p_reason);
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (v_actor, 'adjust_credit_limit', 'customer_credit', p_customer::text, jsonb_build_object('previous', v_prev, 'new', p_new_limit_kobo, 'reason', p_reason));
  return jsonb_build_object('previous', v_prev, 'new', p_new_limit_kobo);
end;
$$;

-- signup: also lock referral reward when registering with a referral code
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_ref text;
  v_outlet uuid;
  v_referrer uuid;
begin
  v_code := 'CD' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
  v_outlet := nullif(new.raw_user_meta_data->>'outlet_id', '')::uuid;
  if v_outlet is not null and not exists (select 1 from public.outlets where id = v_outlet and status = 'active') then
    v_outlet := null;
  end if;

  insert into public.profiles (id, full_name, email, phone, outlet_id, customer_code, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    v_outlet,
    v_code,
    ''
  );

  for i in 1..10 loop
    v_ref := 'CDR' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));
    begin
      update public.profiles set referral_code = v_ref where id = new.id;
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;

  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  insert into public.wallets (customer_id) values (new.id);
  insert into public.token_accounts (customer_id) values (new.id);

  update public.token_accounts set available_tokens = 1000 where customer_id = new.id;
  insert into public.token_ledger (
    customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description
  ) values (
    new.id, 'welcome', 1000, 1000, 1000, 0,
    'WELCOME-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
    'Welcome allocation: 1,000 Campus Delight tokens'
  );

  -- referral: lock the referrer's reward if a valid code was provided
  v_referrer := (select r.id from public.profiles r
    where r.referral_code = upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')))
      and r.id <> new.id limit 1);
  if v_referrer is not null then
    perform public.lock_referral_reward(v_referrer, new.id);
  end if;

  return new;
end;
$$;

revoke execute on function public.transfer_tokens(text, bigint, text) from anon;
revoke execute on function public.apply_wallet_funding(uuid, bigint, text) from anon;
revoke execute on function public.place_order(jsonb, text, uuid, int) from anon;
revoke execute on function public.repay_loan(uuid, bigint) from anon;
revoke execute on function public.apply_outlet_transfer(uuid, text) from anon;
revoke execute on function public.request_otp(text) from anon;
revoke execute on function public.verify_otp(text) from anon;
revoke execute on function public.admin_adjust_credit_limit(uuid, bigint, text) from anon;
revoke execute on function public.lock_referral_reward(uuid, uuid) from anon;
revoke execute on function public.unlock_referral_reward(uuid) from anon;
revoke execute on function public.activate_subscription(uuid, text) from anon;
revoke execute on function public.apply_wallet_funding(uuid, bigint, text) from authenticated;
revoke execute on function public.lock_referral_reward(uuid, uuid) from authenticated;
revoke execute on function public.unlock_referral_reward(uuid) from authenticated;
revoke execute on function public.admin_adjust_credit_limit(uuid, bigint, text) from authenticated;

grant execute on function public.transfer_tokens(text, bigint, text) to authenticated;
grant execute on function public.place_order(jsonb, text, uuid, int) to authenticated;
grant execute on function public.repay_loan(uuid, bigint) to authenticated;
grant execute on function public.apply_outlet_transfer(uuid, text) to authenticated;
grant execute on function public.request_otp(text) to authenticated;
grant execute on function public.verify_otp(text) to authenticated;
grant execute on function public.activate_subscription(uuid, text) to authenticated;
grant all on function public.apply_wallet_funding(uuid, bigint, text) to service_role;
grant all on function public.lock_referral_reward(uuid, uuid), public.unlock_referral_reward(uuid) to service_role;
grant all on function public.admin_adjust_credit_limit(uuid, bigint, text) to service_role;
grant execute on function public.get_config(text) to authenticated;
