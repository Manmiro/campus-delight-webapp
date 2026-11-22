-- Persist the VAPID key pair in a service-only table when deployment secrets
-- are not supplied. The private key is never readable by authenticated users.
CREATE TABLE IF NOT EXISTS public.web_push_vapid_keys (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.web_push_vapid_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_vapid_keys TO service_role;
