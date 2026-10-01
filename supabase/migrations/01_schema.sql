-- =============================================================================
-- Attendance & Salary Management: initial schema
--
-- Contents
--   1. Extensions & schemas
--   2. Enums
--   3. Tables (owner_settings, workers, attendance_logs, advances, worker_sessions)
--   4. Indexes
--   5. Triggers (owner bootstrap, attendance date/minutes/OT/status)
--   6. Row Level Security + column privileges (pin_hash is never readable)
--   7. Admin RPCs (set_worker_pin, mark_attendance, payroll_report)
--   8. Worker RPCs for /punch (kiosk + personal mode), callable by anon
--   9. Realtime publication
--
-- Design notes
--   * Workers never get Supabase Auth accounts. Every worker-facing action goes
--     through a SECURITY DEFINER function that checks the PIN (or a session
--     token issued after a PIN check) and returns only that worker's data.
--   * A business is identified on /punch by owner_settings.kiosk_code, a random
--     unguessable code the owner shares as a link / QR. The worker list of one
--     business is only visible to someone holding that code.
--   * PINs are bcrypt-hashed (pgcrypto crypt + gen_salt('bf')). After 5 wrong
--     PINs a worker is locked for 15 minutes, which makes guessing a 4-digit
--     PIN impractical.
--   * One attendance row per worker per day (the day the shift started, in the
--     owner's timezone). Overnight shifts close on the row they opened.
-- =============================================================================

-- 1. Extensions & schemas ------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live here; this schema is not exposed through the API.
create schema if not exists private;
revoke all on schema private from public;

-- 2. Enums --------------------------------------------------------------------
create type public.wage_type as enum ('daily', 'hourly', 'monthly');
create type public.attendance_status as enum ('present', 'half_day', 'absent');

-- 3. Tables -------------------------------------------------------------------

-- One row per owner (admin). Created automatically when the owner signs up.
create table public.owner_settings (
  owner_id      uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default 'My Business',
  timezone      text not null default 'Asia/Kolkata',
  kiosk_code    text not null unique
                default upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)),
  currency      text not null default 'INR',
  created_at    timestamptz not null default now(),
  constraint owner_settings_timezone_valid
    check (now() at time zone timezone is not null)
);

create table public.workers (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                 text not null check (length(trim(name)) > 0),
  phone                text check (phone is null or phone ~ '^[0-9+]{6,15}$'),
  pin_hash             text,
  photo_url            text,
  wage_type            public.wage_type not null default 'daily',
  daily_rate           numeric(12, 2) not null default 0 check (daily_rate >= 0),
  hourly_rate          numeric(12, 2) not null default 0 check (hourly_rate >= 0),
  monthly_salary       numeric(12, 2) not null default 0 check (monthly_salary >= 0),
  standard_shift_hours numeric(4, 2) not null default 8.0
                       check (standard_shift_hours > 0 and standard_shift_hours <= 24),
  ot_rate_per_hour     numeric(12, 2) not null default 0 check (ot_rate_per_hour >= 0),
  is_active            boolean not null default true,
  -- PIN brute-force protection (not readable by clients)
  failed_pin_attempts  smallint not null default 0,
  pin_locked_until     timestamptz,
  created_at           timestamptz not null default now()
);

create table public.attendance_logs (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references public.workers (id) on delete cascade,
  date            date not null,
  -- Nullable only for owner-entered days without a punch (Mark Present/Absent).
  clock_in        timestamptz,
  clock_out       timestamptz,
  total_minutes   integer check (total_minutes is null or total_minutes >= 0),
  status          public.attendance_status not null default 'present',
  ot_minutes      integer not null default 0 check (ot_minutes >= 0),
  manual_override boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint attendance_clock_in_required check (clock_in is not null or manual_override),
  constraint attendance_clock_order check (clock_out is null or clock_out >= clock_in),
  constraint attendance_one_row_per_day unique (worker_id, date)
);

create table public.advances (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers (id) on delete cascade,
  date       date not null default current_date,
  amount     numeric(12, 2) not null check (amount > 0),
  notes      text,
  created_at timestamptz not null default now()
);

-- Personal-mode login sessions. Only a SHA-256 of the token is stored.
create table public.worker_sessions (
  token_hash   text primary key,
  worker_id    uuid not null references public.workers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '90 days'
);

-- 4. Indexes ------------------------------------------------------------------
create index workers_owner_idx on public.workers (owner_id) where is_active;
create unique index workers_owner_phone_key on public.workers (owner_id, phone) where phone is not null;
-- (worker_id, date) is already covered by the unique constraint.
create index attendance_date_idx on public.attendance_logs (date);
create index attendance_open_idx on public.attendance_logs (worker_id) where clock_out is null;
create index advances_worker_date_idx on public.advances (worker_id, date);
create index worker_sessions_worker_idx on public.worker_sessions (worker_id);

-- 5. Triggers -----------------------------------------------------------------

-- 5a. Create owner_settings for every new admin account.
create or replace function private.handle_new_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.owner_settings (owner_id) values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_owner();

-- 5b. Attendance: fill date, compute total_minutes / ot_minutes / status.
--   total_minutes = floor((clock_out - clock_in) / 1 minute)
--   ot_minutes    = minutes beyond standard_shift_hours (0 if none)
--   status (unless manual_override):
--       >= full shift  -> present
--       >= half shift  -> half_day
--       <  half shift  -> absent  (too short to count as a day)
create or replace function private.compute_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_minutes integer;
  v_tz            text;
begin
  select round(w.standard_shift_hours * 60)::integer, coalesce(s.timezone, 'Asia/Kolkata')
    into v_shift_minutes, v_tz
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = new.worker_id;

  if new.date is null and new.clock_in is not null then
    new.date := (new.clock_in at time zone v_tz)::date;
  end if;

  if new.clock_in is not null and new.clock_out is not null then
    new.total_minutes := floor(extract(epoch from (new.clock_out - new.clock_in)) / 60)::integer;
    new.ot_minutes    := greatest(new.total_minutes - v_shift_minutes, 0);
    if not new.manual_override then
      new.status := case
        when new.total_minutes >= v_shift_minutes     then 'present'
        when new.total_minutes * 2 >= v_shift_minutes then 'half_day'
        else 'absent'
      end::public.attendance_status;
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

create trigger attendance_compute
  before insert or update of clock_in, clock_out, status, manual_override, ot_minutes, date
  on public.attendance_logs
  for each row execute function private.compute_attendance();

-- 6. Row Level Security -------------------------------------------------------
alter table public.owner_settings  enable row level security;
alter table public.workers         enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.advances        enable row level security;
alter table public.worker_sessions enable row level security;  -- no policies: RPC-only

-- Helper: does the current admin own this worker? (security definer avoids
-- recursive RLS evaluation and keeps policies fast)
create or replace function private.owns_worker(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workers w
     where w.id = p_worker_id and w.owner_id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.owns_worker(uuid) to authenticated;

create policy "owner reads own settings" on public.owner_settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner updates own settings" on public.owner_settings
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner manages own workers" on public.workers
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner manages own attendance" on public.attendance_logs
  for all to authenticated
  using (private.owns_worker(worker_id))
  with check (private.owns_worker(worker_id));

create policy "owner manages own advances" on public.advances
  for all to authenticated
  using (private.owns_worker(worker_id))
  with check (private.owns_worker(worker_id));

-- Column privileges: anon gets nothing on tables (it only calls RPCs).
-- Admins can never read or write pin_hash / lockout columns directly;
-- PINs are set through set_worker_pin().
revoke all on public.owner_settings, public.workers, public.attendance_logs,
              public.advances, public.worker_sessions from anon, authenticated;

grant select, update (business_name, timezone, currency) on public.owner_settings to authenticated;
grant select (owner_id, business_name, timezone, kiosk_code, currency, created_at)
  on public.owner_settings to authenticated;

grant select (id, owner_id, name, phone, photo_url, wage_type, daily_rate, hourly_rate,
              monthly_salary, standard_shift_hours, ot_rate_per_hour, is_active, created_at)
  on public.workers to authenticated;
grant insert (id, name, phone, photo_url, wage_type, daily_rate, hourly_rate, monthly_salary,
              standard_shift_hours, ot_rate_per_hour, is_active)
  on public.workers to authenticated;
grant update (name, phone, photo_url, wage_type, daily_rate, hourly_rate, monthly_salary,
              standard_shift_hours, ot_rate_per_hour, is_active)
  on public.workers to authenticated;
grant delete on public.workers to authenticated;

grant select, insert, update, delete on public.attendance_logs to authenticated;
grant select, insert, update, delete on public.advances to authenticated;

-- 7. Admin RPCs ---------------------------------------------------------------

-- Set or reset a worker's 4-digit PIN. Also clears any lockout.
create or replace function public.set_worker_pin(p_worker_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = '22023';
  end if;

  update public.workers
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         failed_pin_attempts = 0,
         pin_locked_until = null
   where id = p_worker_id
     and owner_id = (select auth.uid());

  if not found then
    raise exception 'Worker not found' using errcode = 'P0002';
  end if;

  -- Changing a PIN logs the worker out of personal devices.
  delete from public.worker_sessions where worker_id = p_worker_id;
end;
$$;

-- One-tap manual mark from the Live Attendance Board.
-- Keeps any real punches on the row; only status + manual_override change.
create or replace function public.mark_attendance(
  p_worker_id uuid,
  p_date      date,
  p_status    public.attendance_status,
  p_notes     text default null
)
returns public.attendance_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.attendance_logs;
begin
  insert into public.attendance_logs (worker_id, date, status, manual_override, notes)
  values (p_worker_id, p_date, p_status, true, p_notes)
  on conflict (worker_id, date) do update
     set status = excluded.status,
         manual_override = true,
         notes = coalesce(excluded.notes, public.attendance_logs.notes)
  returning * into v_row;
  return v_row;
end;
$$;

-- Payroll for the signed-in owner over [p_start, p_end] (inclusive).
-- Runs as the caller, so RLS limits it to the owner's own workers.
--
-- Rules
--   daily   : present = daily_rate, half_day = 50%, + ot_hours * ot_rate
--             (OT only exists past a full shift, so a half day never earns OT)
--   hourly  : regular hours * hourly_rate + OT hours * ot_rate
--             (ot_rate 0 => OT hours are paid at hourly_rate, i.e. plain
--              total_minutes/60 * hourly_rate as in the spec, no double pay)
--             A manual "present" with no punches counts as one standard shift,
--             a manual "half_day" as half a shift.
--   monthly : per_day = monthly_salary / days in that date's month
--             present = per_day, half_day = 0.5 * per_day, + ot_hours * ot_rate
--   net     = gross - advances dated within the range
-- Rows still clocked in (no clock_out, not manually marked) are not paid yet;
-- they are reported in open_punches so the owner can fix them.
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
        case when l.manual_override and l.status = 'present'  then round(w.standard_shift_hours * 60)
             when l.manual_override and l.status = 'half_day' then round(w.standard_shift_hours * 30)
             else 0 end
      )::numeric as worked_minutes,
      extract(day from (date_trunc('month', l.date) + interval '1 month - 1 day'))::numeric as month_days,
      w.wage_type, w.daily_rate, w.hourly_rate, w.monthly_salary, w.ot_rate_per_hour
    from public.attendance_logs l
    join public.workers w on w.id = l.worker_id
    where l.date between p_start and p_end
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

grant execute on function public.set_worker_pin(uuid, text)  to authenticated;
grant execute on function public.mark_attendance(uuid, date, public.attendance_status, text) to authenticated;
grant execute on function public.payroll_report(date, date)  to authenticated;

-- 8. Worker RPCs (/punch) -----------------------------------------------------
-- All return jsonb of the shape { ok: boolean, error?: text, ... } instead of
-- raising, so failed-PIN counters are committed rather than rolled back.
-- Error codes: invalid_code, not_found, locked, wrong_pin, no_pin,
--              invalid_session, already_done_today

-- Checks a PIN with lockout. Returns null on success or an error jsonb.
create or replace function private.check_pin(p_worker_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_attempts constant smallint := 5;
  c_lock         constant interval := interval '15 minutes';
  v_worker public.workers;
begin
  select * into v_worker from public.workers where id = p_worker_id for update;

  if v_worker.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_pin');
  end if;

  if v_worker.pin_locked_until is not null and v_worker.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'locked_until', v_worker.pin_locked_until);
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4}$'
     and extensions.crypt(p_pin, v_worker.pin_hash) = v_worker.pin_hash then
    update public.workers
       set failed_pin_attempts = 0, pin_locked_until = null
     where id = p_worker_id and (failed_pin_attempts <> 0 or pin_locked_until is not null);
    return null;
  end if;

  if v_worker.failed_pin_attempts + 1 >= c_max_attempts then
    update public.workers
       set failed_pin_attempts = 0, pin_locked_until = now() + c_lock
     where id = p_worker_id;
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'locked_until', now() + c_lock);
  end if;

  update public.workers
     set failed_pin_attempts = failed_pin_attempts + 1
   where id = p_worker_id;
  return jsonb_build_object('ok', false, 'error', 'wrong_pin',
                            'attempts_left', c_max_attempts - v_worker.failed_pin_attempts - 1);
end;
$$;

-- Today's status + last 7 days for one worker.
create or replace function private.worker_summary(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select w.id, w.name, w.photo_url, w.standard_shift_hours,
           coalesce(s.timezone, 'Asia/Kolkata') as tz
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

-- Toggle: clock out of the open shift, or clock in for today.
create or replace function private.do_punch(p_worker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_today date;
  v_open  public.attendance_logs;
  v_row   public.attendance_logs;
begin
  select coalesce(s.timezone, 'Asia/Kolkata') into v_tz
    from public.workers w
    left join public.owner_settings s on s.owner_id = w.owner_id
   where w.id = p_worker_id;
  v_today := (now() at time zone v_tz)::date;

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
    update public.attendance_logs set clock_out = now()
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
       set clock_in = now(), manual_override = false, status = 'present'
     where id = v_row.id
    returning * into v_row;
  else
    insert into public.attendance_logs (worker_id, date, clock_in)
    values (p_worker_id, v_today, now())
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'action', 'clock_in', 'at', v_row.clock_in)
         || jsonb_build_object('summary', private.worker_summary(p_worker_id));
end;
$$;

create or replace function private.worker_by_kiosk(p_kiosk_code text, p_worker_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
    from public.workers w
    join public.owner_settings s on s.owner_id = w.owner_id
   where s.kiosk_code = upper(trim(p_kiosk_code))
     and w.id = p_worker_id
     and w.is_active;
$$;

create or replace function private.worker_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
begin
  update public.worker_sessions s
     set last_used_at = now()
    from public.workers w
   where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and s.expires_at > now()
     and w.id = s.worker_id
     and w.is_active
  returning s.worker_id into v_worker_id;
  return v_worker_id;
end;
$$;

-- Kiosk: business info + worker cards (name, photo, clocked-in flag only).
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

-- Kiosk: verify PIN only (to show the worker their screen before punching).
create or replace function public.kiosk_verify_pin(p_kiosk_code text, p_worker_id uuid, p_pin text)
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
  return private.worker_summary(v_worker_id);
end;
$$;

-- Kiosk: verify PIN and punch in one call.
create or replace function public.kiosk_punch(p_kiosk_code text, p_worker_id uuid, p_pin text)
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
  return private.do_punch(v_worker_id);
end;
$$;

-- Personal phone: business code (from the owner's link/QR) + phone + PIN.
-- Returns a long random token; the app keeps it in an httpOnly cookie.
create or replace function public.worker_login(p_kiosk_code text, p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
  v_err   jsonb;
  v_token text;
begin
  select w.id into v_worker_id
    from public.workers w
    join public.owner_settings s on s.owner_id = w.owner_id
   where s.kiosk_code = upper(trim(p_kiosk_code))
     and w.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g')
     and w.is_active;

  if v_worker_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_err := private.check_pin(v_worker_id, p_pin);
  if v_err is not null then
    return v_err;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.worker_sessions (token_hash, worker_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_worker_id);

  delete from public.worker_sessions where worker_id = v_worker_id and expires_at < now();

  return jsonb_build_object('ok', true, 'token', v_token)
         || jsonb_build_object('summary', private.worker_summary(v_worker_id));
end;
$$;

create or replace function public.worker_status(p_token text)
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
  return private.worker_summary(v_worker_id);
end;
$$;

create or replace function public.worker_punch(p_token text)
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
  return private.do_punch(v_worker_id);
end;
$$;

create or replace function public.worker_logout(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.worker_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Functions are executable by PUBLIC by default; lock everything down first.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.owns_worker(uuid) to authenticated;

revoke execute on function
  public.set_worker_pin(uuid, text),
  public.mark_attendance(uuid, date, public.attendance_status, text),
  public.payroll_report(date, date),
  public.kiosk_list_workers(text),
  public.kiosk_verify_pin(text, uuid, text),
  public.kiosk_punch(text, uuid, text),
  public.worker_login(text, text, text),
  public.worker_status(text),
  public.worker_punch(text),
  public.worker_logout(text)
from public;

grant execute on function public.set_worker_pin(uuid, text) to authenticated;
grant execute on function public.mark_attendance(uuid, date, public.attendance_status, text) to authenticated;
grant execute on function public.payroll_report(date, date) to authenticated;

grant execute on function
  public.kiosk_list_workers(text),
  public.kiosk_verify_pin(text, uuid, text),
  public.kiosk_punch(text, uuid, text),
  public.worker_login(text, text, text),
  public.worker_status(text),
  public.worker_punch(text),
  public.worker_logout(text)
to anon, authenticated;

-- 9. Realtime (live attendance board) -----------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attendance_logs;
  end if;
end;
$$;
