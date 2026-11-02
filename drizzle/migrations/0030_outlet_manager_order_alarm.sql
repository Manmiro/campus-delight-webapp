-- Persist each manager's preference for new-order dashboard alarms.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS outlet_order_alarm_enabled boolean NOT NULL DEFAULT true;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, gender, date_of_birth, avatar_url, leaderboard_opt_in, outlet_order_alarm_enabled) ON public.profiles TO authenticated;
