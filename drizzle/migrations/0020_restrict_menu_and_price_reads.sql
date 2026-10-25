DROP POLICY IF EXISTS "menu items readable by everyone" ON public.menu_items;
CREATE POLICY "signed-in users read menu items" ON public.menu_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "plan prices readable by everyone" ON public.outlet_plan_prices;
CREATE POLICY "active plan prices readable by everyone" ON public.outlet_plan_prices FOR SELECT USING (is_active = true);