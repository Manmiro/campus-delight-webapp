alter table public.token_ledger drop constraint if exists token_ledger_tx_type_check;
alter table public.token_ledger add constraint token_ledger_tx_type_check check (tx_type in ('welcome','referral_locked','referral_unlock','transfer_in','transfer_out','transfer_fee','spend','expiry','reversal','admin','reward'));

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  checkin_date date not null,
  streak integer not null check (streak >= 1),
  spin_tokens integer not null check (spin_tokens between 1 and 20),
  bonus_tokens integer not null default 0 check (bonus_tokens >= 0),
  created_at timestamptz not null default now(),
  unique (customer_id, checkin_date)
);
grant select on public.daily_checkins to authenticated;
grant all on public.daily_checkins to service_role;
alter table public.daily_checkins enable row level security;
create policy "customers read own checkins" on public.daily_checkins for select to authenticated using (auth.uid() = customer_id);
create policy "admins read all checkins" on public.daily_checkins for select to authenticated using (public.is_central_admin());

create or replace function public.claim_daily_checkin()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_prev public.daily_checkins;
  v_streak int;
  v_spin int;
  v_bonus int := 0;
  v_total int;
  v_avail bigint;
  v_locked bigint;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'Profile not found'; end if;

  perform 1 from public.token_accounts where customer_id = v_uid for update;
  if not found then raise exception 'Token account not found'; end if;

  if exists (select 1 from public.daily_checkins where customer_id = v_uid and checkin_date = v_today) then
    raise exception 'Already checked in today — come back tomorrow!';
  end if;

  select * into v_prev from public.daily_checkins where customer_id = v_uid order by checkin_date desc limit 1;
  v_streak := case when v_prev.checkin_date = v_today - 1 then v_prev.streak + 1 else 1 end;
  v_spin := 1 + floor(random() * 20)::int;
  if v_streak % 30 = 0 then v_bonus := 200;
  elsif v_streak % 7 = 0 then v_bonus := 50;
  elsif v_streak = 3 then v_bonus := 20;
  end if;
  v_total := v_spin + v_bonus;

  insert into public.daily_checkins (customer_id, checkin_date, streak, spin_tokens, bonus_tokens)
    values (v_uid, v_today, v_streak, v_spin, v_bonus);

  update public.token_accounts set available_tokens = available_tokens + v_total, updated_at = now()
    where customer_id = v_uid returning available_tokens, locked_tokens into v_avail, v_locked;

  insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
    values (v_uid, 'reward', v_total, v_total, v_avail, v_locked,
      'DAILY-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
      'Daily check-in: ' || v_spin || ' spin tokens' || case when v_bonus > 0 then ' + ' || v_bonus || ' streak bonus' else '' end);

  return json_build_object('streak', v_streak, 'spin', v_spin, 'bonus', v_bonus, 'total', v_total);
end;
$$;
revoke all on function public.claim_daily_checkin() from public, anon;
grant execute on function public.claim_daily_checkin() to authenticated;