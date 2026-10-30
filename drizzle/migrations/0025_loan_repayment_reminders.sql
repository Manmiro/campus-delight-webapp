CREATE TABLE public.loan_reminder_sends (
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  days_left integer NOT NULL CHECK (days_left BETWEEN 0 AND 3),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loan_id, reminder_date)
);
GRANT ALL ON public.loan_reminder_sends TO service_role;
ALTER TABLE public.loan_reminder_sends ENABLE ROW LEVEL SECURITY;

-- Service-only: open Pay Later loans due within 0–3 Lagos days that still owe money
-- and have not been reminded today.
CREATE OR REPLACE FUNCTION public.due_loan_reminders()
RETURNS TABLE (
  loan_id uuid, customer_id uuid, email text, full_name text, gender text,
  outlet_name text, item_summary text, due_at timestamptz, days_left integer, balance_kobo bigint, reminder_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Africa/Lagos')::date AS d)
  SELECT l.id, l.customer_id, p.email, p.full_name, p.gender, o.name, l.item_summary, l.due_at,
         ((l.due_at AT TIME ZONE 'Africa/Lagos')::date - t.d)::integer,
         greatest(l.total_due_kobo + l.overdue_kobo - coalesce((
           SELECT sum(r.amount_kobo) FROM public.loan_repayments r
           WHERE r.loan_id = l.id AND r.status = 'successful'), 0), 0)::bigint,
         t.d
  FROM public.loans l
  CROSS JOIN today t
  JOIN public.profiles p ON p.id = l.customer_id
  LEFT JOIN public.outlets o ON o.id = l.outlet_id
  WHERE l.status IN ('active', 'partially_repaid')
    AND ((l.due_at AT TIME ZONE 'Africa/Lagos')::date - t.d) BETWEEN 0 AND 3
    AND p.email IS NOT NULL AND p.is_active
    AND NOT EXISTS (SELECT 1 FROM public.loan_reminder_sends s WHERE s.loan_id = l.id AND s.reminder_date = t.d)
    AND l.total_due_kobo + l.overdue_kobo > coalesce((
           SELECT sum(r.amount_kobo) FROM public.loan_repayments r
           WHERE r.loan_id = l.id AND r.status = 'successful'), 0)
  ORDER BY l.due_at
  LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.due_loan_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_loan_reminders() TO service_role;