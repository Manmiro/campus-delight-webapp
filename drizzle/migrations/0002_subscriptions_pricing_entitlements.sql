create table public.outlet_plan_prices (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  plan text not null check (plan in ('weekend','weekly','monthly')),
  tier text not null check (tier in ('basic','standard','turbo')),
  price_kobo bigint not null check (price_kobo >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (outlet_id, plan, tier)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  outlet_id uuid not null references public.outlets(id),
  plan text not null check (plan in ('weekend','weekly','monthly')),
  tier text not null check (tier in ('basic','standard','turbo')),
  price_kobo bigint not null,
  status text not null default 'awaiting_payment' check (status in ('available','awaiting_payment','active','expired','cancelled','suspended','renewal_pending')),
  start_date date,
  end_date date,
  payment_reference text unique,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create table public.meal_entitlements (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  service_date date not null,
  allowance int not null check (allowance in (1,2,3)),
  redeemed int not null default 0 check (redeemed >= 0),
  unique (subscription_id, service_date)
);

alter table public.outlet_plan_prices enable row level security;
create policy "plan prices readable by everyone" on public.outlet_plan_prices for select using (true);
create policy "outlet managers manage own prices" on public.outlet_plan_prices for all to authenticated using (public.is_outlet_manager(outlet_id)) with check (public.is_outlet_manager(outlet_id));
create policy "admins manage all prices" on public.outlet_plan_prices for all to authenticated using (public.is_central_admin()) with check (public.is_central_admin());

alter table public.subscriptions enable row level security;
create policy "customers read own subscriptions" on public.subscriptions for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet subscriptions" on public.subscriptions for select to authenticated using (outlet_id = public.my_outlet_id());
create policy "admins read all subscriptions" on public.subscriptions for select to authenticated using (public.is_central_admin());
create policy "customers create own subscription rows" on public.subscriptions for insert to authenticated with check (auth.uid() = customer_id and status = 'awaiting_payment' and outlet_id = public.my_outlet_id());
create policy "customers cancel own subscription" on public.subscriptions for update to authenticated using (auth.uid() = customer_id and status in ('awaiting_payment')) with check (auth.uid() = customer_id and status in ('awaiting_payment','cancelled'));
create policy "staff manage outlet subscriptions" on public.subscriptions for update to authenticated using (public.is_outlet_staff(outlet_id) or public.is_central_admin()) with check (public.is_outlet_staff(outlet_id) or public.is_central_admin());

alter table public.meal_entitlements enable row level security;
create policy "customers read own entitlements" on public.meal_entitlements for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet entitlements" on public.meal_entitlements for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all entitlements" on public.meal_entitlements for select to authenticated using (public.is_central_admin());
-- redeemed count changes only via the security-definer redemption RPC

grant select on public.outlet_plan_prices to anon, authenticated;
grant all on public.outlet_plan_prices to service_role;
grant select, insert, update on public.subscriptions to authenticated;
grant select on public.meal_entitlements to authenticated;
grant all on public.outlet_plan_prices, public.subscriptions, public.meal_entitlements to service_role;
