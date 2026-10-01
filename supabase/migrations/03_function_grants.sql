-- =============================================================================
-- Owner-only functions must not be callable by signed-out visitors.
--
-- Supabase grants EXECUTE on every new function in `public` to anon and
-- authenticated directly, so the `revoke ... from public` in 01_schema.sql
-- left anon able to call these. They were still safe (set_worker_pin checks
-- auth.uid(), the others run under RLS), but anon has no business calling them.
-- =============================================================================
revoke execute on function
  public.set_worker_pin(uuid, text),
  public.mark_attendance(uuid, date, public.attendance_status, text),
  public.payroll_report(date, date)
from anon;
