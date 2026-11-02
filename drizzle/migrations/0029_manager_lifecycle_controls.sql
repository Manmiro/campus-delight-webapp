-- Headquarters manager lifecycle controls. Suspended assignments are retained
-- for restoration, but inactive assignments never grant outlet access.
ALTER TABLE public.outlet_staff
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.outlet_staff
  DROP CONSTRAINT IF EXISTS outlet_staff_status_check;
ALTER TABLE public.outlet_staff
  ADD CONSTRAINT outlet_staff_status_check CHECK (status IN ('active', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS outlet_staff_one_active_manager_per_outlet
ON public.outlet_staff (outlet_id)
WHERE staff_role = 'outlet_manager' AND status = 'active';

CREATE OR REPLACE FUNCTION public.is_outlet_manager(_outlet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.outlet_staff
    WHERE user_id = auth.uid()
      AND outlet_id = _outlet_id
      AND staff_role = 'outlet_manager'
      AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_outlet_staff(_outlet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.outlet_staff
    WHERE user_id = auth.uid()
      AND outlet_id = _outlet_id
      AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_manager_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = 'outlet_manager'
    AND NOT EXISTS (
      SELECT 1 FROM public.outlet_staff
      WHERE user_id = p_user_id
        AND staff_role = 'outlet_manager'
        AND status = 'active'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_outlet_manager(p_outlet_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment record;
BEGIN
  IF NOT public.is_central_admin() THEN RAISE EXCEPTION 'Forbidden: central administrators only'; END IF;
  IF p_outlet_id IS NULL THEN RAISE EXCEPTION 'Outlet is required'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'Reason must be 500 characters or fewer'; END IF;

  SELECT id, user_id, status INTO v_assignment
  FROM public.outlet_staff
  WHERE outlet_id = p_outlet_id AND staff_role = 'outlet_manager'
  ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No manager is assigned to this outlet'; END IF;

  DELETE FROM public.outlet_staff WHERE id = v_assignment.id;
  PERFORM public.admin_clear_manager_role(v_assignment.user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'remove_outlet_manager', 'outlet_staff', v_assignment.id::text,
    jsonb_build_object('outlet_id', p_outlet_id, 'manager_id', v_assignment.user_id, 'previous_status', v_assignment.status, 'reason', btrim(p_reason))
  );
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'manager_id', v_assignment.user_id, 'action', 'removed');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_outlet_manager_suspension(p_outlet_id uuid, p_suspended boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment record;
  v_action text;
BEGIN
  IF NOT public.is_central_admin() THEN RAISE EXCEPTION 'Forbidden: central administrators only'; END IF;
  IF p_outlet_id IS NULL THEN RAISE EXCEPTION 'Outlet is required'; END IF;
  IF p_suspended IS NULL THEN RAISE EXCEPTION 'Suspension status is required'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'Reason must be 500 characters or fewer'; END IF;

  SELECT id, user_id, status INTO v_assignment
  FROM public.outlet_staff
  WHERE outlet_id = p_outlet_id AND staff_role = 'outlet_manager'
  ORDER BY CASE WHEN status = CASE WHEN p_suspended THEN 'active' ELSE 'suspended' END THEN 0 ELSE 1 END, id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND OR (p_suspended AND v_assignment.status <> 'active') OR (NOT p_suspended AND v_assignment.status <> 'suspended') THEN
    RAISE EXCEPTION 'Manager is already in the requested state or is not assigned to this outlet';
  END IF;

  UPDATE public.outlet_staff
  SET status = CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END
  WHERE id = v_assignment.id;

  IF p_suspended THEN
    PERFORM public.admin_clear_manager_role(v_assignment.user_id);
    v_action := 'suspend_outlet_manager';
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_assignment.user_id, 'outlet_manager')
    ON CONFLICT (user_id, role) DO NOTHING;
    v_action := 'restore_outlet_manager';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), v_action, 'outlet_staff', v_assignment.id::text,
    jsonb_build_object('outlet_id', p_outlet_id, 'manager_id', v_assignment.user_id, 'previous_status', v_assignment.status, 'status', CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END, 'reason', btrim(p_reason))
  );
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'manager_id', v_assignment.user_id, 'status', CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_replace_outlet_manager(p_outlet_id uuid, p_new_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old record;
  v_new_name text;
  v_had_old boolean := false;
BEGIN
  IF NOT public.is_central_admin() THEN RAISE EXCEPTION 'Forbidden: central administrators only'; END IF;
  IF p_outlet_id IS NULL OR p_new_user_id IS NULL THEN RAISE EXCEPTION 'Outlet and replacement manager are required'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'Reason must be 500 characters or fewer'; END IF;

  SELECT full_name INTO v_new_name FROM public.profiles WHERE id = p_new_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Replacement manager profile not found'; END IF;

  SELECT id, user_id, status INTO v_old
  FROM public.outlet_staff
  WHERE outlet_id = p_outlet_id AND staff_role = 'outlet_manager'
  ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id
  LIMIT 1
  FOR UPDATE;
  v_had_old := FOUND;
  IF v_had_old AND v_old.user_id = p_new_user_id THEN RAISE EXCEPTION 'Replacement manager is already assigned to this outlet'; END IF;

  IF v_had_old THEN
    DELETE FROM public.outlet_staff WHERE id = v_old.id;
    PERFORM public.admin_clear_manager_role(v_old.user_id);
  END IF;

  INSERT INTO public.outlet_staff (user_id, outlet_id, staff_role, status)
  VALUES (p_new_user_id, p_outlet_id, 'outlet_manager', 'active')
  ON CONFLICT (user_id, outlet_id, staff_role)
  DO UPDATE SET status = 'active';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_new_user_id, 'outlet_manager')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(), 'replace_outlet_manager', 'outlet_staff', p_outlet_id::text,
    jsonb_build_object('outlet_id', p_outlet_id, 'old_manager_id', CASE WHEN v_had_old THEN v_old.user_id ELSE NULL END, 'new_manager_id', p_new_user_id, 'new_manager_name', v_new_name, 'reason', btrim(p_reason))
  );
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'old_manager_id', CASE WHEN v_had_old THEN v_old.user_id ELSE NULL END, 'new_manager_id', p_new_user_id, 'action', 'replaced');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_manager_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_outlet_manager(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_outlet_manager_suspension(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_replace_outlet_manager(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_outlet_manager(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_outlet_manager_suspension(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_outlet_manager(uuid, uuid, text) TO authenticated;
