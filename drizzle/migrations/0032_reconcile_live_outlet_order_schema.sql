-- Reconcile live databases that predate the outlet lifecycle and alarm
-- migrations. Keep this migration self-contained so it can repair a partially
-- upgraded environment without depending on the previous migration journal.
ALTER TABLE public.outlet_staff
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'outlet_staff_status_check'
      AND conrelid = 'public.outlet_staff'::regclass
  ) THEN
    ALTER TABLE public.outlet_staff
      ADD CONSTRAINT outlet_staff_status_check CHECK (status IN ('active', 'suspended'));
  END IF;
END
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS outlet_order_alarm_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.is_outlet_manager(_outlet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outlet_staff
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
    SELECT 1
    FROM public.outlet_staff
    WHERE user_id = auth.uid()
      AND outlet_id = _outlet_id
      AND status = 'active'
  )
$$;

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

-- Repair the known production manager and keep all active managers assigned to
-- the named outlet aligned with their staff assignment.
UPDATE public.profiles AS p
SET outlet_id = o.id
FROM public.outlets AS o
WHERE lower(p.email) = lower('campusdelightng@gmail.com')
  AND o.name = 'Ebonyi State University Outlet';

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'orders'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END
$$;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, gender, date_of_birth, avatar_url, leaderboard_opt_in, outlet_order_alarm_enabled) ON public.profiles TO authenticated;
