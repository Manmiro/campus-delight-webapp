-- Headquarters outlet operations: catalog administration and manager price locks.
ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS price_edit_locked boolean NOT NULL DEFAULT false;

GRANT SELECT (price_edit_locked) ON public.outlets TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_outlet_price_edit_lock(
  p_outlet_id uuid,
  p_locked boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outlet public.outlets;
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer';
  END IF;

  SELECT * INTO v_outlet
  FROM public.outlets
  WHERE id = p_outlet_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet not found';
  END IF;

  UPDATE public.outlets
  SET price_edit_locked = p_locked
  WHERE id = p_outlet_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_locked THEN 'lock_outlet_price_edits' ELSE 'unlock_outlet_price_edits' END,
    'outlets',
    p_outlet_id::text,
    jsonb_build_object(
      'outlet_name', v_outlet.name,
      'price_edit_locked', p_locked,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'price_edit_locked', p_locked);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_outlet_price_edit_lock(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_outlet_price_edit_lock(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_locked_outlet_manager_menu_price_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outlet_id uuid;
  v_locked boolean;
  v_old_locked boolean := false;
BEGIN
  v_outlet_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.outlet_id ELSE NEW.outlet_id END;
  SELECT price_edit_locked INTO v_locked
  FROM public.outlets
  WHERE id = v_outlet_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT price_edit_locked INTO v_old_locked
    FROM public.outlets
    WHERE id = OLD.outlet_id;
  END IF;

  IF (COALESCE(v_locked, false) OR v_old_locked)
    AND (public.is_outlet_manager(v_outlet_id) OR (TG_OP = 'UPDATE' AND public.is_outlet_manager(OLD.outlet_id)))
    AND NOT public.is_central_admin() THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      RAISE EXCEPTION 'Headquarters has locked price edits for this outlet';
    END IF;
    IF NEW.price_kobo IS DISTINCT FROM OLD.price_kobo THEN
      RAISE EXCEPTION 'Headquarters has locked price edits for this outlet';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_locked_menu_price_edit ON public.menu_items;
CREATE TRIGGER prevent_locked_menu_price_edit
BEFORE INSERT OR UPDATE OR DELETE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_outlet_manager_menu_price_edit();

DROP TRIGGER IF EXISTS prevent_locked_plan_price_edit ON public.outlet_plan_prices;
CREATE TRIGGER prevent_locked_plan_price_edit
BEFORE INSERT OR UPDATE OR DELETE ON public.outlet_plan_prices
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_outlet_manager_menu_price_edit();
