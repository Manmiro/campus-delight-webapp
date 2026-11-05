CREATE TABLE public.email_send_claims (
  idempotency_key text PRIMARY KEY CHECK (char_length(idempotency_key) BETWEEN 1 AND 300),
  template_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_send_claims TO service_role;
ALTER TABLE public.email_send_claims ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.email_send_claims IS 'Service-only: one row per logical email send so retries, refreshes and repeat sign-ins never resend.';

-- Mark receipts that were already delivered before deduplication existed.
INSERT INTO public.email_send_claims (idempotency_key, template_name)
SELECT 'transaction-receipt:' || tl.tx_type || ':' || tl.id || ':' || tl.customer_id, 'transaction-receipt'
FROM public.token_ledger tl
WHERE tl.tx_type IN ('welcome', 'referral_locked')
ON CONFLICT DO NOTHING;

INSERT INTO public.email_send_claims (idempotency_key, template_name)
SELECT 'transaction-receipt:' || CASE WHEN pt.purpose = 'subscription' THEN 'subscription' ELSE 'funding' END || ':' || pt.id || ':' || pt.customer_id, 'transaction-receipt'
FROM public.payment_transactions pt
WHERE pt.status = 'success' AND pt.purpose IN ('wallet_funding', 'subscription')
ON CONFLICT DO NOTHING;

INSERT INTO public.email_send_claims (idempotency_key, template_name)
SELECT 'birthday-greeting:' || extract(year FROM (now() AT TIME ZONE 'Africa/Lagos'))::int || ':' || p.id, 'birthday-greeting'
FROM public.profiles p
WHERE p.date_of_birth IS NOT NULL
  AND to_char(p.date_of_birth, 'MM-DD') <= to_char(now() AT TIME ZONE 'Africa/Lagos', 'MM-DD')
ON CONFLICT DO NOTHING;