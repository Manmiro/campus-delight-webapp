-- Telegram order alerts: outlet chats (personal or kitchen groups) that receive
-- new-order messages, one-time link codes used to connect a chat, and per-order
-- send claims so payment retries never alert twice. All three tables are
-- service-only; authorized server functions read and write them.
CREATE TABLE IF NOT EXISTS public.outlet_telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  chat_title text,
  chat_type text NOT NULL CHECK (chat_type IN ('private', 'group', 'supergroup', 'channel')),
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, chat_id)
);
CREATE INDEX IF NOT EXISTS outlet_telegram_chats_chat_idx ON public.outlet_telegram_chats (chat_id);

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  code_hash text PRIMARY KEY,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telegram_order_alert_claims (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.outlet_telegram_chats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.telegram_link_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.telegram_order_alert_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outlet_telegram_chats TO service_role;
GRANT ALL ON public.telegram_link_codes TO service_role;
GRANT ALL ON public.telegram_order_alert_claims TO service_role;

ALTER TABLE public.outlet_telegram_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_order_alert_claims ENABLE ROW LEVEL SECURITY;

-- Atomically spend a one-time link code (unused and unexpired) and return its outlet.
CREATE OR REPLACE FUNCTION public.consume_telegram_link_code(p_code_hash text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.telegram_link_codes
     SET used_at = now()
   WHERE code_hash = p_code_hash AND used_at IS NULL AND expires_at > now()
  RETURNING outlet_id;
$$;
REVOKE ALL ON FUNCTION public.consume_telegram_link_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_link_code(text) TO service_role;
