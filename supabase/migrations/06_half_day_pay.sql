-- 06: Half day margin and pay (Piyush, 2026-10-15)
--   1. A day short of the timing by less than 1 hour 30 minutes (late in, early
--      out, or both) is still a full day. 1 h 29 min short = full day.
--   2. A half day worked out from the hours is paid as a full day. Only a half
--      day the owner marks by hand is paid as half a day.
-- No DROP: both functions keep their signatures.

-- 1. Status from the hours ------------------------------------------------------
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
          when new.total_minutes > v_shift - 90  then 'present'   -- short by under 1 h 30 min
          when new.total_minutes * 2 >= v_shift  then 'half_day'
          else 'absent'
        end::public.attendance_status;
      end if;
    end if;
  else
    new.total_minutes := null;
    new.ot_minutes    := case when new.manual_override then coalesce(new.ot_minutes, 0) else 0 end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 2. Payroll: only an owner-marked half day is paid as half ----------------------
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

-- 3. Re-check days already punched in and out under the new margin ---------------
update public.attendance_logs
   set clock_out = clock_out
 where not manual_override and status = 'half_day' and clock_in is not null and clock_out is not null;
