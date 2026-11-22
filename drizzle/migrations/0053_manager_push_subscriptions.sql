-- Manager device subscriptions for background Web Push order alerts.
-- The outlet policy is headquarters-controlled: "on" lets an active manager
-- manage their own devices, "off" suppresses delivery, and "locked" also
-- prevents the manager from changing the setting.
ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS manager_push_policy text NOT NULL DEFAULT 'on';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outlets_manager_push_policy_check'
      AND conrelid = 'public.outlets'::regclass
  ) THEN
    ALTER TABLE public.outlets
      ADD CONSTRAINT outlets_manager_push_policy_check
      CHECK (manager_push_policy IN ('on', 'off', 'locked'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.manager_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 20 AND 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 40 AND 200),
  auth text NOT NULL CHECK (length(auth) BETWEEN 16 AND 100),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS manager_push_subscriptions_outlet_enabled_idx
  ON public.manager_push_subscriptions (outlet_id, enabled);

ALTER TABLE public.manager_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers read own push subscriptions" ON public.manager_push_subscriptions;
CREATE POLICY "managers read own push subscriptions"
  ON public.manager_push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_central_admin());

DROP POLICY IF EXISTS "managers register own push subscriptions" ON public.manager_push_subscriptions;
CREATE POLICY "managers register own push subscriptions"
  ON public.manager_push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_central_admin() OR public.is_outlet_manager(outlet_id))
    AND EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = outlet_id AND o.manager_push_policy = 'on'
    )
  );

DROP POLICY IF EXISTS "managers refresh own push subscriptions" ON public.manager_push_subscriptions;
CREATE POLICY "managers refresh own push subscriptions"
  ON public.manager_push_subscriptions FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.is_central_admin() OR public.is_outlet_manager(outlet_id))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_central_admin() OR public.is_outlet_manager(outlet_id))
    AND EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = outlet_id AND o.manager_push_policy = 'on'
    )
  );

DROP POLICY IF EXISTS "managers remove own push subscriptions" ON public.manager_push_subscriptions;
CREATE POLICY "managers remove own push subscriptions"
  ON public.manager_push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_central_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_push_subscriptions TO authenticated;
GRANT SELECT (manager_push_policy) ON public.outlets TO authenticated;
GRANT ALL ON public.manager_push_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_outlet_push_policy(
  p_outlet_id uuid,
  p_policy text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_previous text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Only headquarters can change outlet push notifications';
  END IF;
  IF p_policy IS NULL OR p_policy NOT IN ('on', 'off', 'locked') THEN
    RAISE EXCEPTION 'Invalid outlet push notification policy';
  END IF;

  SELECT manager_push_policy INTO v_previous
  FROM public.outlets WHERE id = p_outlet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outlet not found'; END IF;

  UPDATE public.outlets
  SET manager_push_policy = p_policy
  WHERE id = p_outlet_id;

  IF p_policy IN ('off', 'locked') THEN
    UPDATE public.manager_push_subscriptions
    SET enabled = false, updated_at = now()
    WHERE outlet_id = p_outlet_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'set_outlet_push_policy', 'outlets', p_outlet_id::text,
    jsonb_build_object('previous_policy', v_previous, 'policy', p_policy)
  );
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'policy', p_policy);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_outlet_push_policy(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_outlet_push_policy(uuid, text) TO authenticated;
