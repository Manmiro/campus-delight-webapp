create table public.outlet_transfer_applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  from_outlet_id uuid not null references public.outlets(id),
  to_outlet_id uuid not null references public.outlets(id),
  fee_method text not null check (fee_method in ('cash','tokens')),
  fee_amount bigint not null,
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected','withdrawn','completed')),
  reference text not null unique,
  reviewed_by uuid,
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.customer_credit (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  credit_limit_kobo bigint not null default 210000 check (credit_limit_kobo >= 0),
  outstanding_kobo bigint not null default 0 check (outstanding_kobo >= 0),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  outlet_id uuid not null references public.outlets(id),
  principal_kobo bigint not null check (principal_kobo > 0),
  charge_kobo bigint not null,
  total_due_kobo bigint not null,
  overdue_kobo bigint not null default 0,
  term_days int not null check (term_days in (7,14,30)),
  due_at timestamptz not null,
  status text not null default 'active' check (status in ('active','partially_repaid','fully_repaid_on_time','fully_repaid_late','overdue','under_dispute','written_off','cancelled')),
  item_summary text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id),
  customer_id uuid not null references public.profiles(id),
  amount_kobo bigint not null check (amount_kobo > 0),
  method text not null default 'cash_wallet' check (method in ('cash_wallet','paystack')),
  status text not null default 'successful' check (status in ('pending','successful','failed')),
  reference text not null unique,
  created_at timestamptz not null default now()
);

create table public.credit_limit_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  previous_limit_kobo bigint not null,
  new_limit_kobo bigint not null,
  adjustment_type text not null check (adjustment_type in ('timely_double','untimely_reduce','manual','initial')),
  trigger_loan_id uuid references public.loans(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.outlet_transfer_applications enable row level security;
create policy "customers read own applications" on public.outlet_transfer_applications for select to authenticated using (auth.uid() = customer_id);
create policy "admins manage applications" on public.outlet_transfer_applications for select to authenticated using (public.is_central_admin());
create policy "admins update applications" on public.outlet_transfer_applications for update to authenticated using (public.is_central_admin()) with check (public.is_central_admin());

alter table public.customer_credit enable row level security;
create policy "customers read own credit" on public.customer_credit for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet credit" on public.customer_credit for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all credit" on public.customer_credit for select to authenticated using (public.is_central_admin());

alter table public.loans enable row level security;
create policy "customers read own loans" on public.loans for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet loans" on public.loans for select to authenticated using (outlet_id = public.my_outlet_id());
create policy "admins read all loans" on public.loans for select to authenticated using (public.is_central_admin());

alter table public.loan_repayments enable row level security;
create policy "customers read own repayments" on public.loan_repayments for select to authenticated using (auth.uid() = customer_id);
create policy "staff read outlet repayments" on public.loan_repayments for select to authenticated using (customer_id in (select id from public.profiles where outlet_id = public.my_outlet_id()));
create policy "admins read all repayments" on public.loan_repayments for select to authenticated using (public.is_central_admin());

alter table public.credit_limit_history enable row level security;
create policy "customers read own limit history" on public.credit_limit_history for select to authenticated using (auth.uid() = customer_id);
create policy "admins read all limit history" on public.credit_limit_history for select to authenticated using (public.is_central_admin());

alter table public.notifications enable row level security;
create policy "customers read own notifications" on public.notifications for select to authenticated using (auth.uid() = customer_id);
create policy "customers update own notifications" on public.notifications for update to authenticated using (auth.uid() = customer_id) with check (auth.uid() = customer_id);
create policy "admins read all notifications" on public.notifications for select to authenticated using (public.is_central_admin());

alter table public.audit_logs enable row level security;
create policy "admins read audit logs" on public.audit_logs for select to authenticated using (public.is_central_admin());

grant select on public.outlet_transfer_applications, public.customer_credit, public.loans, public.loan_repayments, public.credit_limit_history, public.notifications, public.audit_logs to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant all on public.outlet_transfer_applications, public.customer_credit, public.loans, public.loan_repayments, public.credit_limit_history, public.notifications, public.audit_logs to service_role;
