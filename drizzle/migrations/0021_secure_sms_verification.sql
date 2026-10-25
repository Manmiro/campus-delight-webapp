ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS phone text;
REVOKE ALL ON public.otp_codes FROM anon, authenticated;
GRANT ALL ON public.otp_codes TO service_role;
REVOKE EXECUTE ON FUNCTION public.request_otp(text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.request_otp(text) IS 'DEPRECATED: demo code disclosure disabled; use service-only issue_sms_otp';
CREATE OR REPLACE FUNCTION public.issue_sms_otp(p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_code text; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_customer::text, 9217));
  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_customer AND is_active = true FOR UPDATE;
  IF NOT FOUND OR v_phone IS NULL THEN RAISE EXCEPTION 'Add a valid phone number to your profile first'; END IF;
  IF EXISTS (SELECT 1 FROM public.otp_codes WHERE customer_id = p_customer AND created_at > now() - interval '60 seconds') THEN RAISE EXCEPTION 'Please wait 60 seconds before requesting another code'; END IF;
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 100000)::text, 5, '0');
  UPDATE public.otp_codes SET consumed = true WHERE customer_id = p_customer AND consumed = false;
  INSERT INTO public.otp_codes(customer_id, code_hash, purpose, expires_at, phone)
  VALUES (p_customer, encode(sha256(convert_to(v_code || ':' || p_customer::text, 'utf8')), 'hex'), 'food_credit', now() + interval '5 minutes', v_phone) RETURNING id INTO v_id;
  RETURN jsonb_build_object('code', v_code, 'id', v_id, 'phone', v_phone);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_sms_otp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_sms_otp(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.verify_otp(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer uuid := auth.uid(); o record; v_phone text;
BEGIN
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_customer AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM public.otp_codes WHERE customer_id = v_customer AND consumed = false AND purpose = 'food_credit' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF o.failed_attempts >= 5 OR o.expires_at <= now() OR o.phone IS DISTINCT FROM v_phone THEN RETURN false; END IF;
  IF btrim(p_code) !~ '^[0-9]{5}$' OR encode(sha256(convert_to(btrim(p_code) || ':' || v_customer::text, 'utf8')), 'hex') <> o.code_hash THEN
    UPDATE public.otp_codes SET failed_attempts = failed_attempts + 1 WHERE id = o.id;
    RETURN false;
  END IF;
  UPDATE public.otp_codes SET consumed = true WHERE id = o.id;
  UPDATE public.profiles SET verification_status = 'verified' WHERE id = v_customer;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_otp(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_otp(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reset_phone_verification() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.verification_status := 'unverified'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reset_phone_verification BEFORE UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.reset_phone_verification();
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(full_name, phone, gender, date_of_birth, avatar_url, leaderboard_opt_in) ON public.profiles TO authenticated;
