create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'meals' check (category in ('meals','swallow','drinks','snacks','sides')),
  price_kobo bigint not null check (price_kobo >= 0),
  is_available boolean not null default true,
  is_credit_eligible boolean not null default false,
  image_url text,
  created_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  outlet_id uuid not null references public.outlets(id),
  payment_method text not null check (payment_method in ('cash_wallet','tokens','subscription_entitlement','food_credit')),
  total_kobo bigint not null,
  tokens_used bigint,
  subscription_id uuid references public.subscriptions(id),
  loan_id uuid,
  status text not null default 'pending' check (status in ('pending','confirmed','fulfilled','cancelled')),
  reference text not null unique,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  item_name text not null,
  unit_price_kobo bigint not null,
  quantity int not null check (quantity > 0)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  purpose text not null check (purpose in ('wallet_funding','subscription','order_payment','outlet_transfer_fee','loan_repayment')),
  amount_kobo bigint not null,
  paystack_reference text not null unique,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  related_id uuid,
  idempotency_key text unique,
  payload jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

alter table public.menu_items enable row level security;
create policy "menu items readable by everyone" on public.menu_items for select using (true);
create policy "outlet managers manage own menu" on public.menu_items for all to authenticated using (public.is_outlet_manager(outlet_id)) with check (public.is_outlet_manager(outlet_id));
create policy "admins manage all menus" on public.menu_items for all to authenticated using (public.is_central_admin()) with check (public.is_central_admin());

alter table public.orders enable row level security;
create policy "customers read own orders" on public.orders for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet orders" on public.orders for select to authenticated using (outlet_id = public.my_outlet_id());
create policy "admins read all orders" on public.orders for select to authenticated using (public.is_central_admin());
-- order creation and status changes go through security-definer RPCs

alter table public.order_items enable row level security;
create policy "customers read own order items" on public.order_items for select to authenticated using (order_id in (select id from public.orders where customer_id = auth.uid()));
create policy "staff read outlet order items" on public.order_items for select to authenticated using (order_id in (select id from public.orders where outlet_id = public.my_outlet_id()));
create policy "admins read all order items" on public.order_items for select to authenticated using (public.is_central_admin());

alter table public.payment_transactions enable row level security;
create policy "customers read own payments" on public.payment_transactions for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet payments" on public.payment_transactions for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all payments" on public.payment_transactions for select to authenticated using (public.is_central_admin());

grant select on public.menu_items to anon, authenticated;
grant all on public.menu_items to service_role;
grant select on public.orders, public.order_items, public.payment_transactions to authenticated;
grant all on public.orders, public.order_items, public.payment_transactions to service_role;
