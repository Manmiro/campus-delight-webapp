CREATE OR REPLACE FUNCTION public.normalize_nigerian_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_phone text;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN NULL;
  END IF;
  v_phone := regexp_replace(btrim(p_phone), '[[:space:]().-]', '', 'g');
  IF v_phone ~ '^0[0-9]{10}$' THEN
    RETURN '+234' || substr(v_phone, 2);
  END IF;
  IF v_phone ~ '^234[0-9]{10}$' THEN
    RETURN '+' || v_phone;
  END IF;
  IF v_phone ~ '^\+234[0-9]{10}$' THEN
    RETURN v_phone;
  END IF;
  IF v_phone ~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN v_phone;
  END IF;
  RAISE EXCEPTION 'Phone number must be a valid Nigerian or international E.164 number';
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.phone := public.normalize_nigerian_phone(NEW.phone);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_nigerian_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_profile_phone() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER normalize_profile_phone
BEFORE INSERT OR UPDATE OF phone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_phone();

UPDATE public.profiles
SET phone = public.normalize_nigerian_phone(phone)
WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX profiles_phone_unique_idx
ON public.profiles (phone)
WHERE phone IS NOT NULL;