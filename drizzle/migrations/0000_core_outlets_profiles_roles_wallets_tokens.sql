create type public.app_role as enum ('customer','outlet_manager','outlet_staff','central_admin');

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  location text,
  address text,
  contact_phone text,
  contact_email text,
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  outlet_id uuid references public.outlets(id),
  customer_code text not null unique,
  referral_code text not null unique,
  is_active boolean not null default true,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

create table public.outlet_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  staff_role text not null check (staff_role in ('outlet_manager','outlet_staff')),
  unique (user_id, outlet_id, staff_role)
);

create table public.wallets (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  balance_kobo bigint not null default 0 check (balance_kobo >= 0),
  updated_at timestamptz not null default now()
);

create table public.token_accounts (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  available_tokens bigint not null default 0 check (available_tokens >= 0),
  locked_tokens bigint not null default 0 check (locked_tokens >= 0),
  updated_at timestamptz not null default now()
);

-- security-definer helpers (created before any policy that uses them)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_central_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'central_admin')
$$;

create or replace function public.is_outlet_manager(_outlet_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.outlet_staff
    where user_id = auth.uid() and outlet_id = _outlet_id and staff_role = 'outlet_manager'
  )
$$;

create or replace function public.is_outlet_staff(_outlet_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.outlet_staff
    where user_id = auth.uid() and outlet_id = _outlet_id
  )
$$;

create or replace function public.my_outlet_id()
returns uuid language sql stable security definer set search_path = public as $$
  select outlet_id from public.profiles where id = auth.uid()
$$;

-- signup provisioning: profile, customer code, referral code, wallet, token account + 1000 welcome tokens
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_ref text;
  v_outlet uuid;
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

  -- generate a unique referral code with bounded retries
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

  -- 1,000 welcome tokens (nominal value: 1 token = NGN 1)
  update public.token_accounts set available_tokens = 1000 where customer_id = new.id;
  insert into public.token_ledger (
    customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description
  ) values (
    new.id, 'welcome', 1000, 1000, 1000, 0,
    'WELCOME-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
    'Welcome allocation: 1,000 Campus Delight tokens'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- outlets are public read (registration needs the outlet list)
alter table public.outlets enable row level security;
create policy "outlets readable by everyone" on public.outlets for select using (true);

alter table public.profiles enable row level security;
create policy "customers read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "staff read outlet customer profiles" on public.profiles for select to authenticated using (
  outlet_id is not null and public.is_outlet_staff(outlet_id)
);
create policy "admins read all profiles" on public.profiles for select to authenticated using (public.is_central_admin());
create policy "customers update own profile" on public.profiles for update to authenticated using (auth.uid() = id)
  with check (auth.uid() = id and outlet_id = public.my_outlet_id() and customer_code = (select customer_code from public.profiles where id = auth.uid()) and referral_code = (select referral_code from public.profiles where id = auth.uid()));

alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.is_central_admin()) with check (public.is_central_admin());

alter table public.outlet_staff enable row level security;
create policy "staff read own assignments" on public.outlet_staff for select to authenticated using (auth.uid() = user_id);
create policy "admins manage outlet staff" on public.outlet_staff for all to authenticated using (public.is_central_admin()) with check (public.is_central_admin());

alter table public.wallets enable row level security;
create policy "customers read own wallet" on public.wallets for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet wallets" on public.wallets for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all wallets" on public.wallets for select to authenticated using (public.is_central_admin());
-- balance changes happen only through security-definer RPCs; no update policies

alter table public.token_accounts enable row level security;
create policy "customers read own token account" on public.token_accounts for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet token accounts" on public.token_accounts for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all token accounts" on public.token_accounts for select to authenticated using (public.is_central_admin());

grant select on public.outlets to anon, authenticated;
grant update (contact_phone, contact_email, address) on public.outlets to authenticated;
grant all on public.outlets to service_role;
grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.outlet_staff to authenticated;
grant select on public.wallets to authenticated;
grant select on public.token_accounts to authenticated;
grant all on public.outlets, public.profiles, public.user_roles, public.outlet_staff, public.wallets, public.token_accounts to service_role;

-- token_ledger is created by handle_new_user's insert; define it here so the trigger compiles
create table public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  tx_type text not null check (tx_type in ('welcome','referral_locked','referral_unlock','transfer_in','transfer_out','transfer_fee','spend','expiry','reversal','admin')),
  amount bigint not null,
  to_available bigint not null default 0,
  to_locked bigint not null default 0,
  available_after bigint not null,
  locked_after bigint not null,
  reference text not null,
  related_transfer_id uuid,
  related_customer_id uuid,
  description text,
  created_at timestamptz not null default now()
);
alter table public.token_ledger enable row level security;
create policy "customers read own token ledger" on public.token_ledger for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet token ledgers" on public.token_ledger for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all token ledgers" on public.token_ledger for select to authenticated using (public.is_central_admin());
grant select on public.token_ledger to authenticated;
grant all on public.token_ledger to service_role;
