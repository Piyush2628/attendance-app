-- 07: Status rules and a special timing for one day (Piyush, 2026-10-21)
--   1. Anyone who clocked in is never Absent. Short of the timing by up to
--      1 h 29 min (late in, early out, or both) is a full day; anything less
--      is a half day, even 2 hours. Absent only when there is no punch, or the
--      owner marks it.
--   2. The owner can set a special timing for one date (e.g. 11:30 to 17:00).
--      That day everyone is judged against it. An employee with their own
--      timing keeps the part of it that falls inside the day's timing
--      (14:00-19:30 own, 11:30-17:00 day -> 14:00-17:00).
--   3. Saving or removing a day timing re-checks that day's attendance.
-- No DROP: compute_attendance() keeps its signature.

-- 1. Day timings ------------------------------------------------------------------
create table public.day_timings (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  work_start time not null,
  work_end   time not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, date),
  constraint day_timings_not_empty check (work_start <> work_end)
);

alter table public.day_timings enable row level security;
create policy "owner manages own day timings" on public.day_timings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
revoke all on public.day_timings from anon, authenticated;
grant select, insert, update, delete on public.day_timings to authenticated;

-- 2. Status from the hours --------------------------------------------------------
create or replace function private.compute_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid;
  v_own_start time;
  v_own_end   time;
  v_start     time;
  v_end       time;
  v_day_start time;
  v_day_end   time;
  v_shift     integer;
  v_tz        text;
  v_late      integer;
begin
  select w.owner_id, w.work_start, w.work_end,
         case when w.work_start is not null then w.work_start else s.work_start end,
         case when w.work_start is not null then w.work_end   else s.work_end   end,
         coalesce(s.timezone, 'Asia/Kolkata')
    into v_owner, v_own_start, v_own_end, v_start, v_end, v_tz
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = new.worker_id;

  if new.date is null and new.clock_in is not null then
    new.date := (new.clock_in at time zone v_tz)::date;
  end if;

  -- A special timing for this date replaces the business timing.
  select d.work_start, d.work_end into v_day_start, v_day_end
    from public.day_timings d
   where d.owner_id = v_owner and d.date = new.date;
  if v_day_start is not null then
    v_start := v_day_start;
    v_end   := v_day_end;
    -- Own timing: keep the part inside the day's timing (day shifts only).
    if v_own_start is not null and v_own_start < v_own_end and v_day_start < v_day_end
       and greatest(v_own_start, v_day_start) < least(v_own_end, v_day_end) then
      v_start := greatest(v_own_start, v_day_start);
      v_end   := least(v_own_end, v_day_end);
    end if;
  end if;
  v_shift := private.shift_minutes(v_start, v_end);

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
        -- Short by up to 1 h 29 min = full day. Clocked in at all = at least a half day.
        new.status := case when new.total_minutes > v_shift - 90 then 'present'
                           else 'half_day' end::public.attendance_status;
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

-- 3. Re-check a day when its timing is saved or removed -------------------------
create or replace function private.recheck_day_timing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select distinct t.owner_id, t.date
             from (select new.owner_id, new.date where tg_op <> 'DELETE'
                   union all
                   select old.owner_id, old.date where tg_op <> 'INSERT') t
  loop
    update public.attendance_logs l
       set clock_out = l.clock_out
      from public.workers w
     where w.id = l.worker_id and w.owner_id = r.owner_id and l.date = r.date;
  end loop;
  return null;
end;
$$;

create trigger day_timings_recheck
  after insert or update or delete on public.day_timings
  for each row execute function private.recheck_day_timing();

-- 4. Re-check every punched day under the new rules -----------------------------
update public.attendance_logs
   set clock_out = clock_out
 where not manual_override and clock_in is not null and clock_out is not null;
