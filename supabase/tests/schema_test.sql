-- Behaviour tests for 01_schema.sql. Run on a scratch database:
--   psql -v ON_ERROR_STOP=1 -f tests/local_supabase_stub.sql -f migrations/01_schema.sql -f tests/schema_test.sql
-- Every check raises an exception on failure.
\set QUIET on
create function pg_temp.check(cond boolean, label text) returns void language plpgsql as
$$ begin if cond is not true then raise exception 'FAILED: %', label; end if; raise notice 'ok - %', label; end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select pg_temp.check((select count(*) = 2 from owner_settings), 'owner_settings auto-created');
update owner_settings set kiosk_code = 'SHOPA12345' where owner_id = '00000000-0000-0000-0000-00000000000a';

-- ---- Owner A -----------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into workers (id, name, phone, wage_type, daily_rate, standard_shift_hours, ot_rate_per_hour) values
  ('11111111-0000-0000-0000-000000000001', 'Ramesh (daily)', '9876500001', 'daily', 800, 8, 100);
insert into workers (id, name, phone, wage_type, hourly_rate, standard_shift_hours, ot_rate_per_hour) values
  ('11111111-0000-0000-0000-000000000002', 'Suresh (hourly)', '9876500002', 'hourly', 100, 8, 150);
insert into workers (id, name, wage_type, monthly_salary, standard_shift_hours, ot_rate_per_hour) values
  ('11111111-0000-0000-0000-000000000003', 'Geeta (monthly)', 'monthly', 30000, 8, 120);
select set_worker_pin('11111111-0000-0000-0000-000000000001', '1234');
select set_worker_pin('11111111-0000-0000-0000-000000000002', '4321');

do $$ begin
  perform pin_hash from workers;
  raise exception 'FAILED: admin could read pin_hash';
exception when insufficient_privilege then raise notice 'ok - admin cannot read pin_hash';
end $$;
do $$ begin
  perform set_worker_pin('11111111-0000-0000-0000-000000000001', '12a4');
  raise exception 'FAILED: bad PIN accepted';
exception when invalid_parameter_value then raise notice 'ok - non-numeric PIN rejected';
end $$;

-- Trigger: minutes / OT / status (Sep 2026, IST)
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000001', '2026-09-01 09:00+05:30', '2026-09-01 18:00+05:30'), -- 9h
  ('11111111-0000-0000-0000-000000000001', '2026-09-02 09:00+05:30', '2026-09-02 14:00+05:30'), -- 5h
  ('11111111-0000-0000-0000-000000000001', '2026-09-03 09:00+05:30', '2026-09-03 11:00+05:30'), -- 2h
  ('11111111-0000-0000-0000-000000000002', '2026-09-01 08:00+05:30', '2026-09-01 18:00+05:30'), -- 10h
  ('11111111-0000-0000-0000-000000000003', '2026-09-01 09:00+05:30', '2026-09-01 17:30+05:30'), -- 8.5h
  ('11111111-0000-0000-0000-000000000003', '2026-09-02 09:00+05:30', '2026-09-02 13:00+05:30'); -- 4h
select pg_temp.check((select total_minutes = 540 and ot_minutes = 60 and status = 'present' and date = '2026-09-01'
                      from attendance_logs where worker_id = '11111111-0000-0000-0000-000000000001' and date = '2026-09-01'),
                     'full day: 540 min, 60 OT, present');
select pg_temp.check((select status = 'half_day' and ot_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000001' and date = '2026-09-02'), '5h = half day');
select pg_temp.check((select status = 'absent' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000001' and date = '2026-09-03'), '2h = absent');
-- Overnight shift is dated by clock-in day (IST)
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000002', '2026-09-02 22:00+05:30', '2026-09-03 06:00+05:30');
select pg_temp.check((select total_minutes = 480 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000002' and date = '2026-09-02'), 'night shift dated by clock-in');
delete from attendance_logs where worker_id = '11111111-0000-0000-0000-000000000002' and date = '2026-09-02';

-- Manual override keeps status
select mark_attendance('11111111-0000-0000-0000-000000000003', '2026-09-04', 'present', 'forgot to punch');
select mark_attendance('11111111-0000-0000-0000-000000000001', '2026-09-03', 'half_day');
select pg_temp.check((select status = 'half_day' and manual_override and total_minutes = 120 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000001' and date = '2026-09-03'),
                     'manual half day overrides 2h punch');

insert into advances (worker_id, date, amount, notes) values
  ('11111111-0000-0000-0000-000000000001', '2026-09-05', 500, 'cash'),
  ('11111111-0000-0000-0000-000000000001', '2026-10-05', 999, 'next month, excluded');

-- Payroll
-- Ramesh: 800 + 400 + 400(manual half) + OT 1h*100 = 1700, advance 500 -> 1200
-- Suresh: 8h*100 + 2h*150 = 1100
-- Geeta: Sep has 30 days -> 1000/day: 8.5h present (+0.5h OT*120=60) + 4h half (500) + manual present (1000) = 2560
select pg_temp.check((select gross_pay = 1700 and advances_total = 500 and net_payable = 1200
                        and days_present = 1 and half_days = 2 and ot_hours = 1
                      from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Ramesh%'), 'payroll daily');
select pg_temp.check((select base_pay = 800 and ot_pay = 300 and gross_pay = 1100
                      from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Suresh%'), 'payroll hourly');
select pg_temp.check((select base_pay = 2500 and ot_pay = 60 and gross_pay = 2560 and days_present = 2 and half_days = 1
                      from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Geeta%'), 'payroll monthly');

-- ---- Owner B is isolated -----------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) = 0 from workers), 'B sees no workers of A');
select pg_temp.check((select count(*) = 0 from attendance_logs), 'B sees no attendance of A');
select pg_temp.check((select count(*) = 0 from payroll_report('2026-09-01', '2026-09-30')), 'B payroll empty');
do $$ begin
  insert into advances (worker_id, amount) values ('11111111-0000-0000-0000-000000000001', 100);
  raise exception 'FAILED: B inserted advance for A''s worker';
exception when insufficient_privilege then raise notice 'ok - B cannot write A''s data';
end $$;
do $$ begin
  perform set_worker_pin('11111111-0000-0000-0000-000000000001', '0000');
  raise exception 'FAILED: B reset A''s PIN';
exception when no_data_found then raise notice 'ok - B cannot reset A''s PIN';
end $$;

-- ---- Anonymous /punch --------------------------------------------------------
reset role;
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  perform 1 from workers;
  raise exception 'FAILED: anon read workers';
exception when insufficient_privilege then raise notice 'ok - anon cannot read tables';
end $$;
do $$ begin
  perform set_worker_pin('11111111-0000-0000-0000-000000000001', '0000');
  raise exception 'FAILED: anon can call set_worker_pin';
exception when insufficient_privilege then raise notice 'ok - anon cannot call owner functions';
end $$;
select pg_temp.check((kiosk_list_workers('nope')->>'error') = 'invalid_code', 'bad kiosk code');
select pg_temp.check(jsonb_array_length(kiosk_list_workers('shopa12345')->'workers') = 3, 'kiosk lists 3 workers');
select pg_temp.check(not (kiosk_list_workers('SHOPA12345')::text like '%pin%' or kiosk_list_workers('SHOPA12345')::text like '%rate%'),
                     'kiosk list exposes no PIN or wage data');

select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000001', '0000')->>'attempts_left')::int = 4, 'wrong PIN, 4 left');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000001', '1234')->>'action') = 'clock_in', 'kiosk clock in');
select pg_temp.check((kiosk_list_workers('SHOPA12345')->'workers'->1->>'clocked_in')::boolean, 'kiosk shows clocked in');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000001', '1234')->>'action') = 'clock_out', 'kiosk clock out');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000001', '1234')->>'error') = 'already_done_today', 'one shift per day');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '1234')->>'error') = 'no_pin', 'worker without PIN');

-- Lockout after 5 wrong PINs, even with the right PIN afterwards
select kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000002', '0000') from generate_series(1, 4);
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000002', '0000')->>'error') = 'locked', '5th wrong PIN locks');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000002', '4321')->>'error') = 'locked', 'locked rejects right PIN');

-- Personal mode
select pg_temp.check((worker_login('SHOPA12345', '98765 00001', '9999')->>'error') = 'wrong_pin', 'login wrong PIN');
create temp table t as select worker_login('SHOPA12345', '98765 00001', '1234') as r;
select pg_temp.check((select (r->>'ok')::boolean and length(r->>'token') = 64 from t), 'login returns token');
select pg_temp.check((select (worker_status(r->>'token')->'worker'->>'name') = 'Ramesh (daily)' from t), 'status by token');
select pg_temp.check((select jsonb_array_length(worker_status(r->>'token')->'history') >= 1 from t), 'history returned');
select pg_temp.check((select (worker_punch(r->>'token')->>'error') = 'already_done_today' from t), 'punch by token');
select worker_logout(r->>'token') from t;
select pg_temp.check((select (worker_status(r->>'token')->>'error') = 'invalid_session' from t), 'logout invalidates token');
reset role;

\echo ALL TESTS PASSED
