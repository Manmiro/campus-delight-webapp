CREATE OR REPLACE FUNCTION public.assign_profile_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_candidate text; v_found boolean;
BEGIN
  -- Serialize allocation until commit; existing unique indexes remain the final guard.
  PERFORM pg_advisory_xact_lock(78461021);
  IF NEW.customer_code IS NULL OR NEW.customer_code !~ '^CD[0-9]{6}$' THEN
    v_found := false;
    FOR i IN 1..1000 LOOP
      v_candidate := 'CD' || lpad(floor(random() * 1000000)::integer::text, 6, '0');
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE customer_code = v_candidate) THEN
        NEW.customer_code := v_candidate; v_found := true; EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN RAISE EXCEPTION 'Unable to allocate a unique customer ID'; END IF;
  END IF;
  IF NEW.referral_code IS NULL OR NEW.referral_code !~ '^CD[0-9]{6}$' THEN
    v_found := false;
    FOR i IN 1..1000 LOOP
      v_candidate := 'CD' || lpad(floor(random() * 1000000)::integer::text, 6, '0');
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_candidate) THEN
        NEW.referral_code := v_candidate; v_found := true; EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN RAISE EXCEPTION 'Unable to allocate a unique referral code'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_profile_codes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER assign_profile_codes BEFORE INSERT OR UPDATE OF customer_code, referral_code ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_profile_codes();
ALTER TABLE public.profiles ADD CONSTRAINT profiles_customer_code_format CHECK (customer_code ~ '^CD[0-9]{6}$') NOT VALID;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_format CHECK (referral_code ~ '^CD[0-9]{6}$') NOT VALID;

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
  UPDATE public.token_accounts SET available_tokens = 1000 WHERE customer_id = new.id;
  INSERT INTO public.token_ledger (customer_id, tx_type, amount, to_available, available_after, locked_after, reference, description)
  VALUES (new.id, 'welcome', 1000, 1000, 1000, 0, 'WELCOME-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)), 'Welcome allocation: 1,000 Campus Delight tokens');
  v_referrer := (SELECT r.id FROM public.profiles r WHERE r.referral_code = upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', ''))) AND r.id <> new.id LIMIT 1);
  IF v_referrer IS NOT NULL THEN PERFORM public.lock_referral_reward(v_referrer, new.id); END IF;
  RETURN new;
END;
$$;