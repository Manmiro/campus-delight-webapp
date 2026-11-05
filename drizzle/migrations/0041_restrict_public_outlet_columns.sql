-- Keep outlet discovery public without exposing contact details or addresses.
-- Headquarters reads the full record through the server-only admin function.
REVOKE SELECT ON public.outlets FROM anon, authenticated;
GRANT SELECT (id, name, code, location, status, delivery_fee_kobo) ON public.outlets TO anon, authenticated;
