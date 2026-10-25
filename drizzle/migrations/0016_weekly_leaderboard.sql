alter table public.profiles add column if not exists leaderboard_opt_in boolean not null default false;

create or replace function public.weekly_leaderboard()
returns table (rank bigint, display_name text, orders bigint, checkins bigint, points bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, outlet_id from public.profiles where id = auth.uid()),
  wk as (select date_trunc('week', now() at time zone 'Africa/Lagos')::date as start),
  players as (
    select p.id, p.full_name from public.profiles p, me
    where p.outlet_id = me.outlet_id and me.outlet_id is not null
      and (p.leaderboard_opt_in or p.id = me.id)
      and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'customer')
  ),
  scored as (
    select pl.id, pl.full_name,
      (select count(*) from public.orders o, wk where o.customer_id = pl.id and o.status in ('confirmed','fulfilled')
        and (o.created_at at time zone 'Africa/Lagos')::date >= wk.start) as orders,
      (select count(*) from public.daily_checkins c, wk where c.customer_id = pl.id and c.checkin_date >= wk.start) as checkins
    from players pl
  ),
  ranked as (
    select s.*, s.orders * 10 + s.checkins * 2 as points,
      rank() over (order by s.orders * 10 + s.checkins * 2 desc) as rnk
    from scored s
  )
  select r.rnk, 
    split_part(r.full_name, ' ', 1) || coalesce(' ' || upper(left(nullif(split_part(r.full_name, ' ', 2), ''), 1)) || '.', ''),
    r.orders, r.checkins, r.points, r.id = auth.uid()
  from ranked r, me
  where r.rnk <= 10 or r.id = me.id
  order by r.rnk, r.full_name;
$$;
revoke all on function public.weekly_leaderboard() from public, anon;
grant execute on function public.weekly_leaderboard() to authenticated;