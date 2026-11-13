-- Menu items are readable only by customers of that outlet, its staff, and headquarters.
CREATE OR REPLACE FUNCTION public.my_profile_outlet_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.outlet_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_profile_outlet_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_outlet_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "signed-in users read menu items" ON public.menu_items;
DROP POLICY IF EXISTS "outlet members read menu items" ON public.menu_items;
CREATE POLICY "outlet members read menu items" ON public.menu_items
FOR SELECT TO authenticated
USING (
  outlet_id = (SELECT public.my_profile_outlet_id())
  OR public.is_outlet_staff(outlet_id)
  OR public.is_central_admin()
);
