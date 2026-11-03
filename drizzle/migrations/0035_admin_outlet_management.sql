-- Headquarters outlet editing and guarded deletion.
-- Deletion is intentionally limited to outlets with no customers or historical
-- records, so financial and fulfillment history cannot be removed accidentally.
CREATE OR REPLACE FUNCTION public.admin_delete_outlet(p_outlet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outlet public.outlets;
  v_customer_count bigint;
  v_order_count bigint;
  v_subscription_count bigint;
  v_loan_count bigint;
  v_transfer_count bigint;
BEGIN
  IF NOT public.is_central_admin() THEN
    RAISE EXCEPTION 'Forbidden: central administrators only';
  END IF;
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet is required';
  END IF;

  SELECT * INTO v_outlet
  FROM public.outlets
  WHERE id = p_outlet_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outlet not found';
  END IF;

  SELECT count(*) INTO v_customer_count FROM public.profiles WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_order_count FROM public.orders WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_subscription_count FROM public.subscriptions WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_loan_count FROM public.loans WHERE outlet_id = p_outlet_id;
  SELECT count(*) INTO v_transfer_count
  FROM public.outlet_transfer_applications
  WHERE from_outlet_id = p_outlet_id OR to_outlet_id = p_outlet_id;

  IF v_customer_count > 0 OR v_order_count > 0 OR v_subscription_count > 0 OR v_loan_count > 0 OR v_transfer_count > 0 THEN
    RAISE EXCEPTION 'Outlet has customers or historical records; mark it inactive instead';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (
    auth.uid(),
    'delete_outlet',
    'outlets',
    p_outlet_id::text,
    jsonb_build_object('name', v_outlet.name, 'code', v_outlet.code, 'status', v_outlet.status)
  );

  DELETE FROM public.outlets WHERE id = p_outlet_id;
  RETURN jsonb_build_object('outlet_id', p_outlet_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_outlet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_outlet(uuid) TO authenticated;
