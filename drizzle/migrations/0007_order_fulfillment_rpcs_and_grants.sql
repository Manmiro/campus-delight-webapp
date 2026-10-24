create or replace function public.fulfill_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select outlet_id into v_outlet from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_outlet_staff(v_outlet) and not public.is_central_admin() then
    raise exception 'Forbidden: not staff of this outlet';
  end if;
  update public.orders set status = 'fulfilled', fulfilled_at = now()
    where id = p_order_id and status = 'confirmed';
  if not found then raise exception 'Order is not in a confirmable state'; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id)
    values (auth.uid(), 'fulfill_order', 'orders', p_order_id::text);
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_avail bigint;
  v_locked bigint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_outlet_staff(o.outlet_id) and not public.is_central_admin() then
    raise exception 'Forbidden: not staff of this outlet';
  end if;
  if o.status <> 'confirmed' then raise exception 'Only confirmed orders can be cancelled'; end if;
  update public.orders set status = 'cancelled' where id = p_order_id;

  if o.payment_method = 'cash_wallet' then
    perform public.apply_wallet_refund(o.customer_id, o.total_kobo, 'REFUND-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), o.id);
  elsif o.payment_method = 'tokens' then
    update public.token_accounts set available_tokens = available_tokens + o.tokens_used, updated_at = now()
      where customer_id = o.customer_id
      returning available_tokens, locked_tokens into v_avail, v_locked;
    insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
      values (o.customer_id, 'reversal', o.tokens_used, o.tokens_used, v_avail, v_locked, 'REVT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Order cancelled — tokens returned');
  elsif o.payment_method = 'subscription_entitlement' then
    update public.meal_entitlements
      set redeemed = greatest(redeemed - 1, 0)
      where subscription_id = o.subscription_id
        and service_date = ((o.created_at at time zone 'Africa/Lagos')::date);
  elsif o.payment_method = 'food_credit' and o.loan_id is not null then
    update public.loans set status = 'cancelled' where id = o.loan_id and status = 'active';
    update public.customer_credit
      set outstanding_kobo = greatest(outstanding_kobo - (select total_due_kobo from public.loans where id = o.loan_id), 0)
      where customer_id = o.customer_id;
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id)
    values (auth.uid(), 'cancel_order', 'orders', p_order_id::text);
end;
$$;

create or replace function public.apply_wallet_refund(p_customer_id uuid, p_amount_kobo bigint, p_reference text, p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  update public.wallets set balance_kobo = balance_kobo + p_amount_kobo, updated_at = now()
    where customer_id = p_customer_id returning balance_kobo into v_balance;
  if not found then raise exception 'Wallet not found'; end if;
  insert into public.wallet_ledger (customer_id, tx_type, amount_kobo, balance_after_kobo, reference, related_order_id, description)
    values (p_customer_id, 'refund', p_amount_kobo, v_balance, p_reference, p_order_id, 'Order cancelled — wallet refund');
end;
$$;

revoke execute on function public.fulfill_order(uuid), public.cancel_order(uuid) from anon;
grant execute on function public.fulfill_order(uuid), public.cancel_order(uuid) to authenticated;

-- the function itself enforces the central-admin role; execution is for admins' browser clients
grant execute on function public.admin_adjust_credit_limit(uuid, bigint, text) to authenticated;
