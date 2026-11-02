-- Resolve an authenticated staff member's outlet from the active assignment
-- before falling back to the profile snapshot used by customer accounts.
CREATE OR REPLACE FUNCTION public.my_outlet_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT os.outlet_id
      FROM public.outlet_staff os
      WHERE os.user_id = auth.uid()
        AND os.status = 'active'
      ORDER BY CASE WHEN os.staff_role = 'outlet_manager' THEN 0 ELSE 1 END, os.id
      LIMIT 1
    ),
    (
      SELECT p.outlet_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  )
$$;

-- Keep the existing manager profile snapshot aligned with the current
-- assignment. This is intentionally scoped to the named production outlet.
UPDATE public.profiles AS p
SET outlet_id = os.outlet_id
FROM public.outlet_staff AS os
JOIN public.outlets AS o ON o.id = os.outlet_id
WHERE p.id = os.user_id
  AND os.staff_role = 'outlet_manager'
  AND os.status = 'active'
  AND o.name = 'Ebonyi State University Outlet';

DROP POLICY IF EXISTS "staff read outlet orders" ON public.orders;
CREATE POLICY "staff read outlet orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_outlet_staff(outlet_id) OR public.is_central_admin());

DROP POLICY IF EXISTS "staff read outlet order items" ON public.order_items;
CREATE POLICY "staff read outlet order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT o.id
    FROM public.orders AS o
    WHERE public.is_outlet_staff(o.outlet_id) OR public.is_central_admin()
  )
);
