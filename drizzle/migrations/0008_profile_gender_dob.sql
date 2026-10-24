alter table public.profiles add column if not exists gender text check (gender in ('male','female')), add column if not exists date_of_birth date;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_ref text; v_outlet uuid; v_referrer uuid; v_gender text; v_dob date;
begin
  v_code := 'CD' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
  v_outlet := nullif(new.raw_user_meta_data->>'outlet_id', '')::uuid;
  if v_outlet is not null and not exists (select 1 from public.outlets where id = v_outlet and status = 'active') then
    v_outlet := null;
  end if;
  v_gender := lower(nullif(new.raw_user_meta_data->>'gender', ''));
  if v_gender not in ('male','female') then v_gender := null; end if;
  begin
    v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  exception when others then v_dob := null; end;

  insert into public.profiles (id, full_name, email, phone, outlet_id, customer_code, referral_code, gender, date_of_birth)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email,
    nullif(new.raw_user_meta_data->>'phone', ''), v_outlet, v_code, '', v_gender, v_dob);

  for i in 1..10 loop
    v_ref := 'CDR' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));
    begin
      update public.profiles set referral_code = v_ref where id = new.id;
      exit;
    exception when unique_violation then continue;
    end;
  end loop;

  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  insert into public.wallets (customer_id) values (new.id);
  insert into public.token_accounts (customer_id) values (new.id);
  update public.token_accounts set available_tokens = 1000 where customer_id = new.id;
  insert into public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
  values (new.id, 'welcome', 1000, 1000, 1000, 0,
    'WELCOME-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
    'Welcome allocation: 1,000 Campus Delight tokens');

  v_referrer := (select r.id from public.profiles r
    where r.referral_code = upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', ''))) and r.id <> new.id limit 1);
  if v_referrer is not null then perform public.lock_referral_reward(v_referrer, new.id); end if;
  return new;
end;
$$;