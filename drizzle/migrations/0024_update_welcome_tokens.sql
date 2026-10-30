-- New customers receive 2,000 welcome tokens. Existing balances and ledger history are unchanged.
UPDATE public.system_config
SET value = jsonb_set(value, '{amount}', '2000'::jsonb), updated_at = now()
WHERE key = 'welcome_tokens';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_outlet uuid; v_referrer uuid; v_gender text; v_dob date;
BEGIN
  v_outlet := nullif(new.raw_user_meta_data->>'outlet_id', '')::uuid;
  IF v_outlet IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = v_outlet AND status = 'active') THEN v_outlet := null; END IF;
  v_gender := lower(nullif(new.raw_user_meta_data->>'gender', ''));
  IF v_gender NOT IN ('male','female') THEN v_gender := null; END IF;
  BEGIN v_dob := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  EXCEPTION WHEN OTHERS THEN v_dob := null; END;
  INSERT INTO public.profiles (id, full_name, email, phone, outlet_id, customer_code, referral_code, gender, date_of_birth)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email,
    nullif(new.raw_user_meta_data->>'phone', ''), v_outlet, '', '', v_gender, v_dob);
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'customer');
  INSERT INTO public.wallets (customer_id) VALUES (new.id);
  INSERT INTO public.token_accounts (customer_id) VALUES (new.id);
  UPDATE public.token_accounts SET available_tokens = 2000 WHERE customer_id = new.id;
  INSERT INTO public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
  VALUES (new.id, 'welcome', 2000, 2000, 2000, 0, 'WELCOME-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Welcome allocation: 2,000 Campus Delight tokens');
  v_referrer := (SELECT r.id FROM public.profiles r WHERE r.referral_code = upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', ''))) AND r.id <> new.id LIMIT 1);
  IF v_referrer IS NOT NULL THEN PERFORM public.lock_referral_reward(v_referrer, new.id); END IF;
  RETURN new;
END;
$$;
