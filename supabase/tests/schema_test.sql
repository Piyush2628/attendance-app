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
-- The early tests use an 8-hour day (09:00 to 17:00) with no off days; 05 tests change both.
update owner_settings set work_start = '09:00', work_end = '17:00', off_days = '{}'
 where owner_id = '00000000-0000-0000-0000-00000000000a';

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

-- ---- GPS check (04_gps.sql) -----------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select set_worker_pin('11111111-0000-0000-0000-000000000003', '5555');
do $$ begin
  update owner_settings set gps_required = true;
  raise exception 'FAILED: GPS check turned on without a work location';
exception when check_violation then raise notice 'ok - GPS check needs a work location';
end $$;
-- Work spot in Delhi, 200 m radius.
update owner_settings set work_lat = 28.6139, work_lng = 77.2090, work_radius_m = 200, gps_required = true;
select pg_temp.check((select gps_required and work_radius_m = 200 from owner_settings), 'owner saves work location');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update owner_settings set gps_required = false
 where owner_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.check((select gps_required from owner_settings where owner_id = '00000000-0000-0000-0000-00000000000a'),
                     'B cannot change A''s GPS setting');

set role anon;
select pg_temp.check((kiosk_list_workers('SHOPA12345')->>'gps_required')::boolean, 'kiosk list says GPS is on');
select pg_temp.check((kiosk_verify_pin('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555')->>'gps_required')::boolean,
                     'worker summary says GPS is on');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555')->>'error') = 'location_needed',
                     'punch without location refused');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555', 999, 77.2090, 10)->>'error') = 'location_needed',
                     'nonsense latitude treated as no location');
create temp table far as
  select kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555', 28.6229, 77.2090, 20) as r;
select pg_temp.check((select r->>'error' = 'outside_area' and (r->>'distance_m')::int between 990 and 1010
                        and (r->>'radius_m')::int = 200 from far), 'punch 1 km away refused with distance');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555', 28.6229, 77.2090, 1500)->>'error') = 'location_weak',
                     'fuzzy fix that might be inside asks to retry');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555', 28.6159, 77.2090, 80)->>'action') = 'clock_in',
                     '222 m away with 80 m accuracy is allowed');
reset role;
select pg_temp.check((select clock_in_distance_m between 215 and 230 and clock_in_accuracy_m = 80
                        and clock_in_lat = 28.6159 and clock_out_lat is null
                      from attendance_logs where worker_id = '11111111-0000-0000-0000-000000000003'
                        and clock_in is not null and clock_out is null),
                     'clock-in location and distance stored');
set role anon;
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555', 28.7, 77.3, 15)->>'error') = 'outside_area',
                     'clock out from far away refused');
reset role;
update owner_settings set gps_required = false where owner_id = '00000000-0000-0000-0000-00000000000a';
set role anon;
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000003', '5555')->>'action') = 'clock_out',
                     'GPS off: punch without location works');
reset role;
select pg_temp.check((select clock_out is not null and clock_out_lat is null and clock_out_distance_m is null
                      from attendance_logs where worker_id = '11111111-0000-0000-0000-000000000003'
                        and clock_in_lat is not null), 'no location stored when none sent');
select pg_temp.check(not exists (select 1 from pg_proc where proname in ('kiosk_punch', 'worker_punch', 'do_punch') and pronargs < 4),
                     'old punch functions dropped');

-- ---- Timings, off days, selfies (05_timings_selfies.sql) ----------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  update owner_settings set work_start = '10:30', work_end = null;
  raise exception 'FAILED: start without end accepted';
exception when check_violation then raise notice 'ok - timing needs both start and end';
end $$;
update owner_settings set work_start = '10:30', work_end = '19:30', off_days = '{0}';
insert into workers (id, name, wage_type, daily_rate, ot_rate_per_hour) values
  ('11111111-0000-0000-0000-000000000005', 'Anil (business timing)', 'daily', 900, 100);
insert into workers (id, name, wage_type, daily_rate, ot_rate_per_hour, work_start, work_end) values
  ('11111111-0000-0000-0000-000000000006', 'Priya (part time)', 'daily', 400, 0, '14:00', '18:00'),
  ('11111111-0000-0000-0000-000000000008', 'Mohan (night)', 'daily', 800, 0, '22:00', '06:00');
insert into workers (id, name, wage_type, monthly_salary, ot_rate_per_hour) values
  ('11111111-0000-0000-0000-000000000007', 'Kavita (monthly)', 'monthly', 26000, 0);
select pg_temp.check((select work_start = '14:00' and work_end = '18:00' from workers
                      where id = '11111111-0000-0000-0000-000000000006'), 'owner sets an employee timing');

-- Business timing 10:30 to 19:30 (9 h)
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000005', '2026-09-07 10:45+05:30', '2026-09-07 19:30+05:30'), -- 8h45, 15 late
  ('11111111-0000-0000-0000-000000000005', '2026-09-08 10:30+05:30', '2026-09-08 15:00+05:30'), -- 4h30
  ('11111111-0000-0000-0000-000000000005', '2026-09-09 10:30+05:30', '2026-09-09 21:30+05:30'), -- 11h
  ('11111111-0000-0000-0000-000000000005', '2026-09-10 10:30+05:30', '2026-09-10 14:00+05:30'), -- 3h30
  ('11111111-0000-0000-0000-000000000005', '2026-09-11 10:00+05:30', '2026-09-11 19:30+05:30'); -- early
select pg_temp.check((select status = 'present' and late_minutes = 15 and ot_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-07'),
                     'business timing: 8h45 of 9h is present, 15 min late');
select pg_temp.check((select status = 'half_day' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-08'),
                     'business timing: 4h30 is half day');
select pg_temp.check((select status = 'present' and ot_minutes = 120 and late_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-09'),
                     'business timing: 11h gives 2h overtime');
select pg_temp.check((select status = 'absent' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-10'),
                     'business timing: 3h30 is absent');
select pg_temp.check((select late_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-11'),
                     'early arrival is not late');

-- Employee timing wins over the business timing (part time 14:00 to 18:00)
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000006', '2026-09-07 14:00+05:30', '2026-09-07 18:00+05:30'),
  ('11111111-0000-0000-0000-000000000006', '2026-09-08 14:00+05:30', '2026-09-08 16:00+05:30');
select pg_temp.check((select status = 'present' and ot_minutes = 0 and late_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000006' and date = '2026-09-07'),
                     'part timer: 4h of 4h is present, no overtime');
select pg_temp.check((select status = 'half_day' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000006' and date = '2026-09-08'),
                     'part timer: 2h is half day');

-- Night timing 22:00 to 06:00 wraps past midnight
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000008', '2026-09-07 21:50+05:30', '2026-09-08 06:00+05:30'),
  ('11111111-0000-0000-0000-000000000008', '2026-09-09 01:00+05:30', '2026-09-09 06:00+05:30');
select pg_temp.check((select status = 'present' and ot_minutes = 10 and late_minutes = 0 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000008' and date = '2026-09-07'),
                     'night timing: 8h10 is present with 10 min overtime');
select pg_temp.check((select late_minutes = 180 and status = 'half_day' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000008' and date = '2026-09-09'),
                     'night timing: in at 01:00 is 3h late');

-- Off days: Sunday 2026-09-06 is recorded but not paid.
-- Sep 2026 has 4 Sundays, so 26 working days: 26000 a month = 1000 a day.
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000007', '2026-09-06 10:30+05:30', '2026-09-06 14:00+05:30'),
  ('11111111-0000-0000-0000-000000000007', '2026-09-07 10:30+05:30', '2026-09-07 19:30+05:30'),
  ('11111111-0000-0000-0000-000000000005', '2026-09-06 10:30+05:30', '2026-09-06 19:30+05:30');
select pg_temp.check((select count(*) = 1 from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000007' and date = '2026-09-06'),
                     'Sunday punch is still recorded');
select pg_temp.check((select base_pay = 1000 and days_present = 1 and half_days = 0
                      from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Kavita%'),
                     'monthly pay over working days, Sunday left out');
-- Anil: Mon 900 + Tue half 450 + Wed 900 (2h OT = 200) + Fri 900 (30 min OT = 50); Sunday unpaid
select pg_temp.check((select base_pay = 3150 and ot_pay = 250 and days_present = 3 and half_days = 1 and absent_days = 1
                      from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Anil%'),
                     'daily pay leaves out Sunday');
update owner_settings set off_days = '{}';
select pg_temp.check((select base_pay = 4050 from payroll_report('2026-09-01', '2026-09-30') where worker_name like 'Anil%'),
                     'with no off days, Sunday is paid');
update owner_settings set off_days = '{0}';

-- No timing at all: a day clocked in and out is present, with no overtime
update owner_settings set work_start = null, work_end = null;
insert into attendance_logs (worker_id, clock_in, clock_out) values
  ('11111111-0000-0000-0000-000000000005', '2026-09-14 11:00+05:30', '2026-09-14 13:00+05:30');
select pg_temp.check((select status = 'present' and ot_minutes = 0 and late_minutes is null from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-14'),
                     'no timing: any punched day is present, no overtime');
select pg_temp.check((select status = 'half_day' from attendance_logs
                      where worker_id = '11111111-0000-0000-0000-000000000006' and date = '2026-09-08'),
                     'no business timing: part timer keeps own timing');
update owner_settings set work_start = '10:30', work_end = '19:30';

-- Selfies
select set_worker_pin('11111111-0000-0000-0000-000000000005', '2468');
update owner_settings set selfie_required = true;
reset role;
-- An old selfie on an old punch, to be cleaned up by the next punch.
insert into punch_selfies (log_id, kind, image, taken_at)
  select id, 'in', 'data:image/jpeg;base64,OLD', now() - interval '46 days' from attendance_logs
   where worker_id = '11111111-0000-0000-0000-000000000005' and date = '2026-09-07';
set role anon;
select pg_temp.check((kiosk_list_workers('SHOPA12345')->>'selfie_required')::boolean, 'kiosk list says selfie is on');
select pg_temp.check((kiosk_verify_pin('SHOPA12345', '11111111-0000-0000-0000-000000000005', '2468')->>'selfie_required')::boolean,
                     'worker summary says selfie is on');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000005', '2468')->>'error') = 'selfie_needed',
                     'punch without selfie refused');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000005', '2468', null, null, null,
                                  'data:image/png;base64,AAAA')->>'error') = 'selfie_needed',
                     'non-JPEG selfie refused');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000005', '2468', null, null, null,
                                  'data:image/jpeg;base64,SU4=')->>'action') = 'clock_in', 'punch with selfie clocks in');
select pg_temp.check((kiosk_punch('SHOPA12345', '11111111-0000-0000-0000-000000000005', '2468', null, null, null,
                                  'data:image/jpeg;base64,T1VU')->>'action') = 'clock_out', 'punch with selfie clocks out');
reset role;
select pg_temp.check((select count(*) = 2 from punch_selfies s join attendance_logs l on l.id = s.log_id
                      where l.worker_id = '11111111-0000-0000-0000-000000000005' and l.clock_out is not null
                        and l.date = (now() at time zone 'Asia/Kolkata')::date),
                     'clock-in and clock-out selfies stored');
select pg_temp.check(not exists (select 1 from punch_selfies where image = 'data:image/jpeg;base64,OLD'),
                     'selfies older than 45 days deleted');
set role authenticated;
select pg_temp.check((select count(*) = 2 from punch_selfies), 'owner sees own selfies');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) = 0 from punch_selfies), 'B sees no selfies of A');
reset role;
set role anon;
do $$ begin
  perform 1 from punch_selfies;
  raise exception 'FAILED: anon read selfies';
exception when insufficient_privilege then raise notice 'ok - anon cannot read selfies';
end $$;
reset role;
select pg_temp.check(not exists (select 1 from pg_proc where proname in ('kiosk_punch', 'worker_punch', 'do_punch') and pronargs < 5),
                     'punch functions without selfie dropped');

\echo ALL TESTS PASSED
