-- Dashboard-to-dashboard messaging between headquarters and active outlet staff.
CREATE TABLE public.dashboard_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sender_outlet_id uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  recipient_scope text NOT NULL CHECK (recipient_scope IN ('headquarters', 'outlet', 'all_outlets')),
  target_outlet_id uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_messages_recipient_check CHECK (
    (recipient_scope = 'headquarters' AND target_outlet_id IS NULL)
    OR (recipient_scope = 'outlet' AND target_outlet_id IS NOT NULL)
    OR (recipient_scope = 'all_outlets' AND target_outlet_id IS NULL)
  ),
  CONSTRAINT dashboard_messages_attachment_check CHECK (
    (attachment_path IS NULL AND attachment_name IS NULL AND attachment_size IS NULL AND attachment_content_type IS NULL)
    OR (
      attachment_path IS NOT NULL
      AND attachment_name IS NOT NULL
      AND attachment_size BETWEEN 1 AND 1048576
      AND attachment_content_type IS NOT NULL
    )
  )
);

CREATE INDEX dashboard_messages_created_at_idx ON public.dashboard_messages (created_at DESC);
CREATE INDEX dashboard_messages_target_outlet_idx ON public.dashboard_messages (target_outlet_id, created_at DESC);
CREATE INDEX dashboard_messages_sender_idx ON public.dashboard_messages (sender_id, created_at DESC);

CREATE TABLE public.dashboard_message_reads (
  message_id uuid NOT NULL REFERENCES public.dashboard_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE OR REPLACE FUNCTION public.can_read_dashboard_message(p_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dashboard_messages m
    WHERE m.id = p_message_id
      AND (
        public.is_central_admin()
        OR m.sender_id = auth.uid()
        OR (
          m.recipient_scope = 'all_outlets'
          AND public.my_outlet_id() IS NOT NULL
          AND public.is_outlet_staff(public.my_outlet_id())
        )
        OR (
          m.recipient_scope = 'outlet'
          AND m.target_outlet_id = public.my_outlet_id()
          AND public.is_outlet_staff(m.target_outlet_id)
        )
      )
  )
$$;

ALTER TABLE public.dashboard_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dashboard participants read messages"
  ON public.dashboard_messages FOR SELECT TO authenticated
  USING (public.can_read_dashboard_message(id));

CREATE POLICY "dashboard users send permitted messages"
  ON public.dashboard_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        public.is_central_admin()
        AND sender_outlet_id IS NULL
        AND (
          recipient_scope = 'headquarters'
          OR recipient_scope = 'all_outlets'
          OR (recipient_scope = 'outlet' AND target_outlet_id IS NOT NULL)
        )
      )
      OR (
        public.is_outlet_staff(sender_outlet_id)
        AND sender_outlet_id = public.my_outlet_id()
        AND recipient_scope = 'headquarters'
        AND target_outlet_id IS NULL
      )
    )
  );

ALTER TABLE public.dashboard_message_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read their message receipts"
  ON public.dashboard_message_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users mark readable messages"
  ON public.dashboard_message_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_read_dashboard_message(message_id));

CREATE POLICY "users update their message receipts"
  ON public.dashboard_message_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.can_read_dashboard_message(message_id));

GRANT SELECT, INSERT ON public.dashboard_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dashboard_message_reads TO authenticated;
GRANT ALL ON public.dashboard_messages, public.dashboard_message_reads TO service_role;
REVOKE ALL ON FUNCTION public.can_read_dashboard_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_dashboard_message(uuid) TO authenticated;

-- Private attachments are staged under the sender's auth id and may only be
-- downloaded when their message is visible to the current dashboard user.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dashboard-attachments', 'dashboard-attachments', false, 1048576)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 1048576;

CREATE POLICY "dashboard users upload their attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dashboard-attachments'
    AND name LIKE (auth.uid()::text || '/%')
  );

CREATE POLICY "dashboard participants download attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dashboard-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.dashboard_messages m
      WHERE m.attachment_path = name
        AND public.can_read_dashboard_message(m.id)
    )
  );

CREATE POLICY "dashboard users remove their staged attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dashboard-attachments'
    AND name LIKE (auth.uid()::text || '/%')
  );

-- Refresh PostgREST's schema cache immediately after the new relations exist.
NOTIFY pgrst, 'reload schema';
