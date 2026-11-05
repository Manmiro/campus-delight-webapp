-- Canonicalize Gmail aliases and reject disposable providers at the Auth boundary.
-- The client rules provide a friendly error; this trigger prevents direct Auth API
-- calls and service-created accounts from bypassing the same policy.
CREATE OR REPLACE FUNCTION public.normalize_and_validate_auth_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local text;
  v_domain text;
  v_blocked_domains text[] := ARRAY[
    '10minutemail.com', '10minutemail.net', 'dispostable.com',
    'emailondeck.com', 'fakemail.net', 'getnada.com',
    'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'grr.la', 'maildrop.cc', 'mailinator.com', 'mailnesia.com',
    'minuteinbox.com', 'moakt.com', 'sharklasers.com', 'temp-mail.io',
    'temp-mail.org', 'tempmail.com', 'tempmail.net', 'throwawaymail.com',
    'trashmail.com', 'trashmail.me', 'yopmail.com'
  ];
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.email := lower(btrim(NEW.email));
  v_domain := split_part(NEW.email, '@', 2);

  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := split_part(split_part(NEW.email, '@', 1), '+', 1);
    NEW.email := replace(v_local, '.', '') || '@gmail.com';
    v_domain := 'gmail.com';
  END IF;

  IF v_domain = ANY(v_blocked_domains) OR EXISTS (
    SELECT 1
    FROM unnest(v_blocked_domains) AS blocked(domain)
    WHERE v_domain LIKE '%.' || blocked.domain
  ) THEN
    RAISE EXCEPTION 'Temporary email addresses are not accepted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_and_validate_auth_email ON auth.users;
CREATE TRIGGER normalize_and_validate_auth_email
BEFORE INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.normalize_and_validate_auth_email();
