-- =============================================================================
-- Work timings, off days and punch selfies
--   1. Optional work timings: one for the business (e.g. 10:30 to 19:30) and an
--      optional one per employee (part time). With no timing at all, any day
--      with a punch counts as a full day and there is no overtime.
--   2. Off days (Sunday by default) are still recorded but left out of salary.
--   3. Optional selfie with every punch, stored small (~20 KB JPEG) and deleted
--      after 45 days.
-- =============================================================================

-- 1. Settings -----------------------------------------------------------------
alter table public.owner_settings
  add column work_start      time,
  add column work_end        time,
  add column off_days        smallint[] not null default '{0}'
                             check (off_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  add column selfie_required boolean not null default false,
  add constraint owner_settings_timing_pair
    check ((work_start is null) = (work_end is null) and (work_start is null or work_start <> work_end));

grant update (work_start, work_end, off_days, selfie_required) on public.owner_settings to authenticated;

alter table public.workers
  add column work_start time,
  add column work_end   time,
  add constraint workers_timing_pair
    check ((work_start is null) = (work_end is null) and (work_start is null or work_start <> work_end));

grant select (work_start, work_end), insert (work_start, work_end), update (work_start, work_end)
  on public.workers to authenticated;

-- Minutes after the start time the employee clocked in (null when no timing).
alter table public.attendance_logs add column late_minutes integer check (late_minutes >= 0);

-- 2. Timing rules -------------------------------------------------------------

-- Shift length in minutes for a start/end pair, wrapping past midnight.
create or replace function private.shift_minutes(p_start time, p_end time)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_start is null or p_end is null then null
              else ((extract(epoch from (p_end - p_start))::integer / 60) % 1440 + 1440) % 1440 end;
$$;

-- Attendance: fill date, compute total_minutes / ot_minutes / late_minutes / status.
--   The employee's own timing is used if set, else the business timing.
--   With a timing (shift = end - start):
--     present  : worked at least the shift minus 30 minutes
--     half day : worked at least half the shift
--     absent   : less
--     overtime : minutes worked beyond the shift
--     late     : minutes clocked in after the start time
--   Without a timing: a day clocked in and out is present, with no overtime.
--   The owner's manual mark always wins.
create or replace function private.compute_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start time;
  v_end   time;
  v_shift integer;
  v_tz    text;
  v_late  integer;
begin
  select case when w.work_start is not null then w.work_start else s.work_start end,
         case when w.work_start is not null then w.work_end   else s.work_end   end,
         coalesce(s.timezone, 'Asia/Kolkata')
    into v_start, v_end, v_tz
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = new.worker_id;
  v_shift := private.shift_minutes(v_start, v_end);

  if new.date is null and new.clock_in is not null then
    new.date := (new.clock_in at time zone v_tz)::date;
  end if;

  -- Late: minutes from the start time to the clock-in, wrapping past midnight
  -- (start 22:00, in at 01:00 = 180 late). Over 12 hours "late" is really an
  -- early arrival: not late.
  new.late_minutes := null;
  if new.clock_in is not null and v_start is not null then
    v_late := floor(extract(epoch from ((new.clock_in at time zone v_tz)::time - v_start)) / 60)::integer;
    v_late := (v_late % 1440 + 1440) % 1440;
    new.late_minutes := case when v_late <= 720 then v_late else 0 end;
  end if;

  if new.clock_in is not null and new.clock_out is not null then
    new.total_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::integer;
    if v_shift is null then
      new.ot_minutes := 0;
      if not new.manual_override then
        new.status := 'present';
      end if;
    else
      new.ot_minutes := greatest(new.total_minutes - v_shift, 0);
      if not new.manual_override then
        new.status := case
          when new.total_minutes >= v_shift - 30      then 'present'
          when new.total_minutes * 2 >= v_shift       then 'half_day'
          else 'absent'
        end::public.attendance_status;
      end if;
    end if;
  else
    -- Still clocked in, or an owner-entered day with no punches.
    new.total_minutes := null;
    new.ot_minutes    := case when new.manual_override then coalesce(new.ot_minutes, 0) else 0 end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 3. Payroll: off days are left out, monthly pay is spread over working days --
create or replace function public.payroll_report(p_start date, p_end date)
returns table (
  worker_id      uuid,
  worker_name    text,
  wage_type      public.wage_type,
  days_present   integer,
  half_days      integer,
  absent_days    integer,
  open_punches   integer,
  worked_hours   numeric,
  ot_hours       numeric,
  base_pay       numeric,
  ot_pay         numeric,
  gross_pay      numeric,
  advances_total numeric,
  net_payable    numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select
      l.worker_id,
      l.status,
      l.manual_override,
      (l.clock_out is null and l.clock_in is not null and not l.manual_override) as is_open,
      l.ot_minutes,
      coalesce(
        l.total_minutes,
        case when l.manual_override and l.status = 'present'
               then coalesce(private.shift_minutes(coalesce(w.work_start, s.work_start), coalesce(w.work_end, s.work_end)),
                             round(w.standard_shift_hours * 60))
             when l.manual_override and l.status = 'half_day'
               then coalesce(private.shift_minutes(coalesce(w.work_start, s.work_start), coalesce(w.work_end, s.work_end)),
                             round(w.standard_shift_hours * 60)) / 2
             else 0 end
      )::numeric as worked_minutes,
      -- Working days in this row's month (calendar days minus off days).
      greatest((
        select count(*)
          from generate_series(date_trunc('month', l.date), date_trunc('month', l.date) + interval '1 month - 1 day',
                               interval '1 day') g
         where extract(dow from g)::smallint <> all (coalesce(s.off_days, '{}'))
      ), 1)::numeric as month_days,
      w.wage_type, w.daily_rate, w.hourly_rate, w.monthly_salary, w.ot_rate_per_hour
    from public.attendance_logs l
    join public.workers w on w.id = l.worker_id
    left join public.owner_settings s on s.owner_id = w.owner_id
    where l.date between p_start and p_end
      and extract(dow from l.date)::smallint <> all (coalesce(s.off_days, '{}'))
  ),
  pay as (
    select
      d.*,
      case when d.is_open then 0 else
        case d.wage_type
          when 'daily' then
            case d.status when 'present' then d.daily_rate
                          when 'half_day' then d.daily_rate * 0.5
                          else 0 end
          when 'monthly' then
            case d.status when 'present' then d.monthly_salary / d.month_days
                          when 'half_day' then d.monthly_salary / d.month_days * 0.5
                          else 0 end
          when 'hourly' then
            greatest(d.worked_minutes - d.ot_minutes, 0) / 60 * d.hourly_rate
        end
      end as day_base,
      case when d.is_open then 0 else
        d.ot_minutes::numeric / 60 *
        case when d.wage_type = 'hourly' and d.ot_rate_per_hour = 0 then d.hourly_rate
             else d.ot_rate_per_hour end
      end as day_ot
    from days d
  ),
  agg as (
    select
      p.worker_id,
      count(*) filter (where p.status = 'present'  and not p.is_open)::integer as days_present,
      count(*) filter (where p.status = 'half_day' and not p.is_open)::integer as half_days,
      count(*) filter (where p.status = 'absent'   and not p.is_open)::integer as absent_days,
      count(*) filter (where p.is_open)::integer                               as open_punches,
      sum(case when p.is_open then 0 else p.worked_minutes end) / 60           as worked_hours,
      sum(case when p.is_open then 0 else p.ot_minutes end)::numeric / 60      as ot_hours,
      sum(p.day_base) as base_pay,
      sum(p.day_ot)   as ot_pay
    from pay p
    group by p.worker_id
  ),
  adv as (
    select a.worker_id, sum(a.amount) as total
    from public.advances a
    where a.date between p_start and p_end
    group by a.worker_id
  )
  select
    w.id,
    w.name,
    w.wage_type,
    coalesce(g.days_present, 0),
    coalesce(g.half_days, 0),
    coalesce(g.absent_days, 0),
    coalesce(g.open_punches, 0),
    round(coalesce(g.worked_hours, 0), 2),
    round(coalesce(g.ot_hours, 0), 2),
    round(coalesce(g.base_pay, 0), 2),
    round(coalesce(g.ot_pay, 0), 2),
    round(coalesce(g.base_pay, 0) + coalesce(g.ot_pay, 0), 2),
    round(coalesce(a.total, 0), 2),
    round(coalesce(g.base_pay, 0) + coalesce(g.ot_pay, 0) - coalesce(a.total, 0), 2)
  from public.workers w
  left join agg g on g.worker_id = w.id
  left join adv a on a.worker_id = w.id
  where w.is_active or g.worker_id is not null or a.worker_id is not null
  order by w.name;
$$;

-- 4. Selfies ------------------------------------------------------------------
create table public.punch_selfies (
  id       uuid primary key default gen_random_uuid(),
  log_id   uuid not null references public.attendance_logs (id) on delete cascade,
  kind     text not null check (kind in ('in', 'out')),
  -- A small JPEG as a data URL. ~20 KB from the punch screen; hard cap 200 KB.
  image    text not null check (image like 'data:image/jpeg;base64,%' and length(image) <= 200000),
  taken_at timestamptz not null default now(),
  constraint punch_selfies_one_per_punch unique (log_id, kind)
);
create index punch_selfies_taken_idx on public.punch_selfies (taken_at);

alter table public.punch_selfies enable row level security;
create policy "owner reads own selfies" on public.punch_selfies
  for select to authenticated
  using (exists (select 1 from public.attendance_logs l
                  where l.id = log_id and private.owns_worker(l.worker_id)));
create policy "owner deletes own selfies" on public.punch_selfies
  for delete to authenticated
  using (exists (select 1 from public.attendance_logs l
                  where l.id = log_id and private.owns_worker(l.worker_id)));
revoke all on public.punch_selfies from anon, authenticated;
grant select, delete on public.punch_selfies to authenticated;

-- 5. Punch screens learn whether to take a selfie -----------------------------
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
           coalesce(s.gps_required, false) as gps_required,
           coalesce(s.selfie_required, false) as selfie_required
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
    'selfie_required', w.selfie_required,
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
    'selfie_required', v_settings.selfie_required,
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

-- 6. Punch with an optional selfie --------------------------------------------
drop function public.kiosk_punch(text, uuid, text, double precision, double precision, double precision);
drop function public.worker_punch(text, double precision, double precision, double precision);
drop function private.do_punch(uuid, double precision, double precision, double precision);

-- Toggle: clock out of the open shift, or clock in for today.
-- Location rules as in 04_gps.sql. With selfie_required on, a punch without a
-- JPEG data URL is refused as selfie_needed. Every punch also clears selfies
-- older than 45 days (indexed, so it stays cheap), which keeps storage flat
-- without a scheduled job.
create or replace function private.do_punch(
  p_worker_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_selfie text default null)
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
  v_selfie   text;
begin
  select s.* into v_s
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = p_worker_id;
  v_tz := coalesce(v_s.timezone, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;

  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    v_lat := p_lat;
    v_lng := p_lng;
    v_acc := case when p_accuracy >= 0 then least(round(p_accuracy), 1000000)::integer end;
    if v_s.work_lat is not null and v_s.work_lng is not null then
      v_distance := round(private.distance_m(v_s.work_lat, v_s.work_lng, v_lat, v_lng))::integer;
    end if;
  end if;

  if p_selfie like 'data:image/jpeg;base64,%' and length(p_selfie) <= 200000 then
    v_selfie := p_selfie;
  end if;

  if coalesce(v_s.selfie_required, false) and v_selfie is null then
    return jsonb_build_object('ok', false, 'error', 'selfie_needed');
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

  delete from public.punch_selfies where taken_at < now() - interval '45 days';

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
    if v_selfie is not null then
      insert into public.punch_selfies (log_id, kind, image) values (v_row.id, 'out', v_selfie)
      on conflict (log_id, kind) do update set image = excluded.image, taken_at = now();
    end if;
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

  if v_selfie is not null then
    insert into public.punch_selfies (log_id, kind, image) values (v_row.id, 'in', v_selfie)
    on conflict (log_id, kind) do update set image = excluded.image, taken_at = now();
  end if;

  return jsonb_build_object('ok', true, 'action', 'clock_in', 'at', v_row.clock_in)
         || jsonb_build_object('summary', private.worker_summary(p_worker_id));
end;
$$;

create or replace function public.kiosk_punch(
  p_kiosk_code text, p_worker_id uuid, p_pin text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_selfie text default null)
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
  return private.do_punch(v_worker_id, p_lat, p_lng, p_accuracy, p_selfie);
end;
$$;

create or replace function public.worker_punch(
  p_token text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_selfie text default null)
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
  return private.do_punch(v_worker_id, p_lat, p_lng, p_accuracy, p_selfie);
end;
$$;

revoke execute on function
  private.shift_minutes(time, time),
  private.do_punch(uuid, double precision, double precision, double precision, text)
from public, anon, authenticated;
-- payroll_report (security invoker, run by the owner) needs shift_minutes.
grant execute on function private.shift_minutes(time, time) to authenticated;

revoke execute on function
  public.kiosk_punch(text, uuid, text, double precision, double precision, double precision, text),
  public.worker_punch(text, double precision, double precision, double precision, text)
from public;
grant execute on function
  public.kiosk_punch(text, uuid, text, double precision, double precision, double precision, text),
  public.worker_punch(text, double precision, double precision, double precision, text)
to anon, authenticated;
