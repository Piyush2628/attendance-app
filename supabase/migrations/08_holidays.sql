-- 08: Holidays (2026-11-14)
--   1. The owner keeps a list of holidays (date + name), each paid or unpaid.
--   2. A holiday is never counted as absent.
--   3. A paid holiday is paid as one day to every employee who was on the
--      books that day: the daily rate, a day of the monthly salary (salary ÷
--      working days in the month), or one shift of hours for hourly staff.
--      A holiday on an off day is already a day off and adds nothing.
--      Holidays are only paid once they have passed (like attendance).
--   4. Punches on a holiday are recorded and shown but, like off days, left
--      out of the salary (a paid holiday is already a paid day).
--   5. payroll_report: two new columns (paid_holidays, holiday_pay) and
--      absent_days now also counts working days with no record at all, the
--      same rule the Attendance page uses, so the slip and that page agree.
--   6. The punch screens learn today's holiday, to show a banner.

-- 1. Holidays -----------------------------------------------------------------
create table public.holidays (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  name       text not null check (length(trim(name)) between 1 and 60),
  paid       boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (owner_id, date)
);

alter table public.holidays enable row level security;
create policy "owner manages own holidays" on public.holidays
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.holidays from anon, authenticated;
grant select, insert, update, delete on public.holidays to authenticated;

-- 2. Helpers --------------------------------------------------------------------
-- Days in the month of p_date that are not off days (at least 1).
create or replace function private.working_days_in_month(p_date date, p_off_days smallint[])
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(count(*), 1)::integer
    from generate_series(date_trunc('month', p_date::timestamp),
                         date_trunc('month', p_date::timestamp) + interval '1 month - 1 day',
                         interval '1 day') g
   where extract(dow from g)::smallint <> all (coalesce(p_off_days, '{}'));
$$;

-- One day's base pay for a paid holiday.
create or replace function private.holiday_day_pay(
  p_wage_type public.wage_type,
  p_daily numeric, p_hourly numeric, p_monthly numeric,
  p_shift_minutes numeric, p_month_days integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_wage_type
           when 'daily'   then p_daily
           when 'monthly' then p_monthly / greatest(p_month_days, 1)
           when 'hourly'  then p_shift_minutes / 60 * p_hourly
         end;
$$;

revoke execute on function private.working_days_in_month(date, smallint[]),
                           private.holiday_day_pay(public.wage_type, numeric, numeric, numeric, numeric, integer)
  from public, anon, authenticated;
-- payroll_report runs as the owner (security invoker).
grant execute on function private.working_days_in_month(date, smallint[]),
                          private.holiday_day_pay(public.wage_type, numeric, numeric, numeric, numeric, integer)
  to authenticated;

-- 3. Payroll --------------------------------------------------------------------
-- New columns, so the old function has to go first.
drop function public.payroll_report(date, date);

create function public.payroll_report(p_start date, p_end date)
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
  net_payable    numeric,
  paid_holidays  integer,
  holiday_pay    numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ws as (
    -- Each employee with their business settings, joining day and today (business time zone).
    -- Columns listed one by one: the owner may not read pin_hash.
    select
      w.id, w.owner_id, w.name, w.is_active, w.wage_type, w.daily_rate, w.hourly_rate,
      w.monthly_salary, w.ot_rate_per_hour,
      s.off_days as s_off_days,
      (w.created_at at time zone coalesce(s.timezone, 'Asia/Kolkata'))::date as joined,
      (now() at time zone coalesce(s.timezone, 'Asia/Kolkata'))::date as today,
      coalesce(private.shift_minutes(coalesce(w.work_start, s.work_start), coalesce(w.work_end, s.work_end)),
               round(w.standard_shift_hours * 60))::numeric as shift_minutes
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
  ),
  days as (
    select
      l.worker_id,
      l.status,
      l.manual_override,
      (l.clock_out is null and l.clock_in is not null and not l.manual_override) as is_open,
      l.ot_minutes,
      coalesce(
        l.total_minutes,
        case when l.manual_override and l.status = 'present'  then w.shift_minutes
             when l.manual_override and l.status = 'half_day' then w.shift_minutes / 2
             else 0 end
      )::numeric as worked_minutes,
      private.working_days_in_month(l.date, w.s_off_days)::numeric as month_days,
      w.wage_type, w.daily_rate, w.hourly_rate, w.monthly_salary, w.ot_rate_per_hour
    from public.attendance_logs l
    join ws w on w.id = l.worker_id
    where l.date between p_start and p_end
      and extract(dow from l.date)::smallint <> all (coalesce(w.s_off_days, '{}'))
      and not exists (select 1 from public.holidays h where h.owner_id = w.owner_id and h.date = l.date)
  ),
  pay as (
    select
      d.*,
      -- Share of a day's pay: a half day from the hours is paid in full.
      case d.status when 'present' then 1
                    when 'half_day' then case when d.manual_override then 0.5 else 1 end
                    else 0 end as day_share,
      case when d.is_open then 0 else
        d.ot_minutes::numeric / 60 *
        case when d.wage_type = 'hourly' and d.ot_rate_per_hour = 0 then d.hourly_rate
             else d.ot_rate_per_hour end
      end as day_ot
    from days d
  ),
  pay2 as (
    select
      p.*,
      case when p.is_open then 0 else
        case p.wage_type
          when 'daily'   then p.daily_rate * p.day_share
          when 'monthly' then p.monthly_salary / p.month_days * p.day_share
          when 'hourly'  then greatest(p.worked_minutes - p.ot_minutes, 0) / 60 * p.hourly_rate
        end
      end as day_base
    from pay p
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
    from pay2 p
    group by p.worker_id
  ),
  -- Working days up to yesterday with no record at all: absent (active employees only;
  -- an inactive one has no leaving date).
  missing as (
    select w.id as worker_id, count(*)::integer as n
      from ws w
      cross join lateral generate_series(greatest(p_start, w.joined)::timestamp,
                                         least(p_end, w.today - 1)::timestamp,
                                         interval '1 day') g
     where w.is_active
       and extract(dow from g)::smallint <> all (coalesce(w.s_off_days, '{}'))
       and not exists (select 1 from public.attendance_logs l where l.worker_id = w.id and l.date = g::date)
       and not exists (select 1 from public.holidays h where h.owner_id = w.owner_id and h.date = g::date)
     group by w.id
  ),
  -- Paid holidays that have passed, on working days, while the employee was on the books
  -- (added by then, and still active or with attendance on or after the holiday).
  hol as (
    select w.id as worker_id,
           count(*)::integer as n,
           sum(private.holiday_day_pay(w.wage_type, w.daily_rate, w.hourly_rate, w.monthly_salary,
                                       w.shift_minutes, private.working_days_in_month(h.date, w.s_off_days))) as pay
      from public.holidays h
      join ws w on w.owner_id = h.owner_id
     where h.paid
       and h.date between p_start and p_end
       and h.date <= w.today
       and h.date >= w.joined
       and extract(dow from h.date)::smallint <> all (coalesce(w.s_off_days, '{}'))
       and (w.is_active or exists (select 1 from public.attendance_logs l
                                    where l.worker_id = w.id and l.date >= h.date))
     group by w.id
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
    coalesce(g.absent_days, 0) + coalesce(m.n, 0),
    coalesce(g.open_punches, 0),
    round(coalesce(g.worked_hours, 0), 2),
    round(coalesce(g.ot_hours, 0), 2),
    round(coalesce(g.base_pay, 0), 2),
    round(coalesce(g.ot_pay, 0), 2),
    round(coalesce(g.base_pay, 0) + coalesce(hl.pay, 0) + coalesce(g.ot_pay, 0), 2),
    round(coalesce(a.total, 0), 2),
    round(coalesce(g.base_pay, 0) + coalesce(hl.pay, 0) + coalesce(g.ot_pay, 0) - coalesce(a.total, 0), 2),
    coalesce(hl.n, 0),
    round(coalesce(hl.pay, 0), 2)
  from public.workers w
  left join agg g on g.worker_id = w.id
  left join missing m on m.worker_id = w.id
  left join hol hl on hl.worker_id = w.id
  left join adv a on a.worker_id = w.id
  where w.is_active or g.worker_id is not null or hl.worker_id is not null or a.worker_id is not null
  order by w.name;
$$;

revoke execute on function public.payroll_report(date, date) from public, anon;
grant execute on function public.payroll_report(date, date) to authenticated;

-- 4. Punch screens: today's holiday ---------------------------------------------
create or replace function private.today_holiday(p_owner_id uuid, p_tz text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', h.name, 'paid', h.paid)
    from public.holidays h
   where h.owner_id = p_owner_id
     and h.date = (now() at time zone coalesce(p_tz, 'Asia/Kolkata'))::date;
$$;
revoke execute on function private.today_holiday(uuid, text) from public, anon, authenticated;

create or replace function private.worker_summary(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select w.id, w.name, w.photo_url, w.standard_shift_hours, w.owner_id,
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
    'holiday', private.today_holiday(w.owner_id, w.tz),
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
    'holiday', private.today_holiday(v_settings.owner_id, v_settings.timezone),
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
