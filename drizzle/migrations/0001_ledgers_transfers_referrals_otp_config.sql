create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  tx_type text not null check (tx_type in ('funding','debit','refund','fee','reversal','admin')),
  amount_kobo bigint not null,
  balance_after_kobo bigint not null,
  reference text not null,
  related_payment_id uuid,
  related_order_id uuid,
  related_loan_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table public.token_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  principal_tokens bigint not null check (principal_tokens > 0),
  fee_tokens bigint not null default 10,
  status text not null default 'success' check (status in ('pending','success','failed')),
  reference text not null unique,
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null unique references public.profiles(id),
  status text not null default 'registered' check (status in ('registered','locked','qualified','rewarded')),
  locked_tokens bigint not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  purpose text not null default 'food_credit' check (purpose in ('food_credit','phone_verification')),
  expires_at timestamptz not null,
  consumed boolean not null default false,
  failed_attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table public.system_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.system_config (key, value) values
  ('welcome_tokens', '{"amount": 1000}'),
  ('token_value', '{"naira_per_token": 1}'),
  ('token_transfer', '{"daily_principal_limit": 500, "fee": 10, "timezone": "Africa/Lagos"}'),
  ('referral', '{"reward_tokens": 100}'),
  ('outlet_transfer_fee', '{"cash_kobo": 50000, "tokens": 500, "monthly_limit": 1, "timezone": "Africa/Lagos", "fee_refundable": false}'),
  ('food_credit', '{"default_limit_kobo": 210000, "max_limit_kobo": null, "timely_multiplier": 2, "untimely_factor": 0.70, "registration_wait_hours": 24, "terms": [{"term_days": 7, "charge_pct": 15}, {"term_days": 14, "charge_pct": 25}, {"term_days": 30, "charge_pct": 50}], "overdue_pct_per_24h": 20, "overdue_compounds": true, "overdue_approved": false, "installments_enabled": true}'),
  ('otp', '{"digits": 5, "expiry_seconds": 300, "max_failed_attempts": 5, "resend_cooldown_seconds": 60}');

alter table public.wallet_ledger enable row level security;
create policy "customers read own wallet ledger" on public.wallet_ledger for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet wallet ledgers" on public.wallet_ledger for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all wallet ledgers" on public.wallet_ledger for select to authenticated using (public.is_central_admin());

alter table public.token_transfers enable row level security;
create policy "parties read own transfers" on public.token_transfers for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "staff read outlet transfers" on public.token_transfers for select to authenticated using (sender_id in (select id from public.profiles where outlet_id = public.my_outlet_id()) or recipient_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all transfers" on public.token_transfers for select to authenticated using (public.is_central_admin());

alter table public.referrals enable row level security;
create policy "referrer reads own referrals" on public.referrals for select to authenticated using (auth.uid() = referrer_id);
create policy "referred reads own referral row" on public.referrals for select to authenticated using (auth.uid() = referred_id);
create policy "admins read all referrals" on public.referrals for select to authenticated using (public.is_central_admin());

alter table public.otp_codes enable row level security;
create policy "customers read own otp rows" on public.otp_codes for select to authenticated using (auth.uid() = customer_id);
create policy "admins read otp rows" on public.otp_codes for select to authenticated using (public.is_central_admin());

alter table public.system_config enable row level security;
create policy "admins read system config" on public.system_config for select to authenticated using (public.is_central_admin());

grant select on public.wallet_ledger, public.token_transfers, public.referrals, public.otp_codes, public.system_config to authenticated;
grant all on public.wallet_ledger, public.token_transfers, public.referrals, public.otp_codes, public.system_config to service_role;
