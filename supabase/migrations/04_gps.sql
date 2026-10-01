-- =============================================================================
-- GPS check on punch
--   1. Owner sets a work location + radius and turns the check on
--   2. Every punch can carry the device's location; it is stored on the day's
--      row (clock-in and clock-out separately) with the distance from work
--   3. With the check on, a punch without a location, or from outside the
--      radius, is refused
--
-- The browser's location can be faked by a determined person (mock-GPS apps).
-- This stops the everyday case: punching from home or on the way to work.
-- =============================================================================

-- 1. Settings -----------------------------------------------------------------
alter table public.owner_settings
  add column work_lat      double precision check (work_lat between -90 and 90),
  add column work_lng      double precision check (work_lng between -180 and 180),
  add column work_radius_m integer not null default 200 check (work_radius_m between 20 and 5000),
  add column gps_required  boolean not null default false,
  add constraint owner_settings_gps_needs_location
    check (not gps_required or (work_lat is not null and work_lng is not null));

grant select, update (work_lat, work_lng, work_radius_m, gps_required)
  on public.owner_settings to authenticated;

-- 2. Where each punch happened ------------------------------------------------
alter table public.attendance_logs
  add column clock_in_lat        double precision,
  add column clock_in_lng        double precision,
  add column clock_in_accuracy_m integer,
  add column clock_in_distance_m integer,
  add column clock_out_lat        double precision,
  add column clock_out_lng        double precision,
  add column clock_out_accuracy_m integer,
  add column clock_out_distance_m integer;

-- Great-circle distance in metres (haversine).
create or replace function private.distance_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  -- least(1, …): rounding can push the value a hair above 1 for opposite points.
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))));
$$;

-- 3. Punch with location ------------------------------------------------------

-- worker_summary tells the punch screen whether to ask for the location.
create or replace function private.worker_summary(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select w.id, w.name, w.photo_url, w.standard_shift_hours,
           coalesce(s.timezone, 'Asia/Kolkata') as tz,
           coalesce(s.gps_required, false) as gps_required
      from public.workers w
      left join public.owner_settings s on s.owner_id = w.owner_id
     where w.id = p_worker_id
  ),
  open_log as (
    select l.clock_in
      from public.attendance_logs l
     where l.worker_id = p_worker_id and l.clock_out is null and l.clock_in is not null
     order by l.clock_in desc
     limit 1
  ),
  today as (
    select l.* from public.attendance_logs l, w
     where l.worker_id = p_worker_id and l.date = (now() at time zone w.tz)::date
  )
  select jsonb_build_object(
    'ok', true,
    'worker', jsonb_build_object('id', w.id, 'name', w.name, 'photo_url', w.photo_url,
                                 'standard_shift_hours', w.standard_shift_hours),
    'gps_required', w.gps_required,
    'clocked_in', exists (select 1 from open_log),
    'clock_in_at', (select clock_in from open_log),
    'today_minutes', coalesce(
        (select total_minutes from today),
        (select floor(extract(epoch from now() - clock_in) / 60)::integer from open_log),
        0),
    'server_time', now(),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', l.date, 'clock_in', l.clock_in, 'clock_out', l.clock_out,
               'total_minutes', l.total_minutes, 'ot_minutes', l.ot_minutes,
               'status', l.status) order by l.date desc)
        from public.attendance_logs l
       where l.worker_id = p_worker_id
         and l.date > (now() at time zone w.tz)::date - 7
    ), '[]'::jsonb)
  )
  from w;
$$;

drop function public.kiosk_punch(text, uuid, text);
drop function public.worker_punch(text);
drop function private.do_punch(uuid);

-- Toggle: clock out of the open shift, or clock in for today.
-- p_accuracy is the browser's accuracy radius in metres.
--
-- With the check on, a punch is accepted when
--   distance <= radius + min(accuracy, 100)
-- so a fuzzy indoor fix next to the boundary still passes, but a fix that is
-- only "somewhere in this town" does not. When the fix is too fuzzy to tell,
-- the error is location_weak (try again) rather than outside_area.
create or replace function private.do_punch(
  p_worker_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s        public.owner_settings;
  v_tz       text;
  v_today    date;
  v_open     public.attendance_logs;
  v_row      public.attendance_logs;
  v_lat      double precision;
  v_lng      double precision;
  v_acc      integer;
  v_distance integer;
begin
  select s.* into v_s
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = p_worker_id;
  v_tz := coalesce(v_s.timezone, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;

  -- Ignore anything that is not a real coordinate.
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_lat := p_lat;
    v_lng := p_lng;
    v_acc := case when p_accuracy >= 0 then least(round(p_accuracy), 1000000)::integer end;
    if v_s.work_lat is not null and v_s.work_lng is not null then
      v_distance := round(private.distance_m(v_s.work_lat, v_s.work_lng, v_lat, v_lng))::integer;
    end if;
  end if;

  if coalesce(v_s.gps_required, false) then
    if v_lat is null then
      return jsonb_build_object('ok', false, 'error', 'location_needed');
    end if;
    if v_distance > v_s.work_radius_m + least(coalesce(v_acc, 0), 100) then
      return jsonb_build_object(
        'ok', false,
        'error', case when v_acc > 100 and v_distance - v_acc <= v_s.work_radius_m
                      then 'location_weak' else 'outside_area' end,
        'distance_m', v_distance,
        'radius_m', v_s.work_radius_m,
        'accuracy_m', v_acc);
    end if;
  end if;

  -- An open shift from the last 20 hours is closed (covers night shifts).
  -- Older open shifts are left for the owner to fix.
  select * into v_open
    from public.attendance_logs
   where worker_id = p_worker_id
     and clock_out is null and clock_in is not null
     and clock_in > now() - interval '20 hours'
   order by clock_in desc
   limit 1
   for update;

  if found then
    update public.attendance_logs
       set clock_out = now(),
           clock_out_lat = v_lat, clock_out_lng = v_lng,
           clock_out_accuracy_m = v_acc, clock_out_distance_m = v_distance
     where id = v_open.id
    returning * into v_row;
    return jsonb_build_object('ok', true, 'action', 'clock_out', 'at', v_row.clock_out,
                              'total_minutes', v_row.total_minutes, 'status', v_row.status)
           || jsonb_build_object('summary', private.worker_summary(p_worker_id));
  end if;

  select * into v_row from public.attendance_logs
   where worker_id = p_worker_id and date = v_today
   for update;

  if found then
    if v_row.clock_in is not null then
      -- One shift per day: already clocked in and out today.
      return jsonb_build_object('ok', false, 'error', 'already_done_today');
    end if;
    -- Owner pre-marked today without punches: attach the real punch to it.
    update public.attendance_logs
       set clock_in = now(), manual_override = false, status = 'present',
           clock_in_lat = v_lat, clock_in_lng = v_lng,
           clock_in_accuracy_m = v_acc, clock_in_distance_m = v_distance
     where id = v_row.id
    returning * into v_row;
  else
    insert into public.attendance_logs
      (worker_id, date, clock_in, clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_distance_m)
    values (p_worker_id, v_today, now(), v_lat, v_lng, v_acc, v_distance)
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'action', 'clock_in', 'at', v_row.clock_in)
         || jsonb_build_object('summary', private.worker_summary(p_worker_id));
end;
$$;

-- Kiosk: verify PIN and punch in one call.
create or replace function public.kiosk_punch(
  p_kiosk_code text, p_worker_id uuid, p_pin text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid := private.worker_by_kiosk(p_kiosk_code, p_worker_id);
  v_err jsonb;
begin
  if v_worker_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_err := private.check_pin(v_worker_id, p_pin);
  if v_err is not null then
    return v_err;
  end if;
  return private.do_punch(v_worker_id, p_lat, p_lng, p_accuracy);
end;
$$;

create or replace function public.worker_punch(
  p_token text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid := private.worker_by_token(p_token);
begin
  if v_worker_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;
  return private.do_punch(v_worker_id, p_lat, p_lng, p_accuracy);
end;
$$;

-- Kiosk list: same as before plus gps_required, so the kiosk can ask for
-- location permission up front instead of on the first punch.
create or replace function public.kiosk_list_workers(p_kiosk_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.owner_settings;
begin
  select * into v_settings from public.owner_settings
   where kiosk_code = upper(trim(p_kiosk_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  return jsonb_build_object(
    'ok', true,
    'business_name', v_settings.business_name,
    'gps_required', v_settings.gps_required,
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'photo_url', w.photo_url,
               'clocked_in', exists (
                 select 1 from public.attendance_logs l
                  where l.worker_id = w.id and l.clock_out is null and l.clock_in is not null
                    and l.clock_in > now() - interval '20 hours'))
             order by w.name)
        from public.workers w
       where w.owner_id = v_settings.owner_id and w.is_active
    ), '[]'::jsonb));
end;
$$;

revoke execute on function
  private.distance_m(double precision, double precision, double precision, double precision),
  private.do_punch(uuid, double precision, double precision, double precision)
from public, anon, authenticated;

revoke execute on function
  public.kiosk_punch(text, uuid, text, double precision, double precision, double precision),
  public.worker_punch(text, double precision, double precision, double precision)
from public;
grant execute on function
  public.kiosk_punch(text, uuid, text, double precision, double precision, double precision),
  public.worker_punch(text, double precision, double precision, double precision)
to anon, authenticated;
