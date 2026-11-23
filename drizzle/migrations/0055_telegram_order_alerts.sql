-- Telegram connections and one-time dashboard links for manager order alerts.
-- These tables are intentionally service-role only: chat IDs and link tokens
-- must never be writable or enumerable from the browser.
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token text PRIMARY KEY CHECK (length(token) BETWEEN 32 AND 128),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('private', 'group')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_expiry_idx
  ON public.telegram_link_tokens (expires_at);

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE CHECK (length(chat_id) BETWEEN 1 AND 64),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  connected_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_type text NOT NULL CHECK (chat_type IN ('private', 'group', 'supergroup')),
  title text,
  username text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_chats_outlet_active_idx
  ON public.telegram_chats (outlet_id, active);

CREATE TABLE IF NOT EXISTS public.telegram_order_alert_claims (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, chat_id)
);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_order_alert_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_link_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.telegram_chats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.telegram_order_alert_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.telegram_link_tokens TO service_role;
GRANT ALL ON public.telegram_chats TO service_role;
GRANT ALL ON public.telegram_order_alert_claims TO service_role;
