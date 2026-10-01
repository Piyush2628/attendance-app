# Attendance & Salary

Attendance and payroll for small businesses, workshops and daily-wage / contract staff.
Workers clock in and out with a 4-digit PIN; the owner sees who is in today, records cash
advances (udhari) and prints salary slips. Runs entirely on free tiers: Next.js on Vercel and
Supabase.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui (new-york), Lucide icons
- Supabase: Postgres, Auth (owners only), Row Level Security, Realtime
- PWA: `src/app/manifest.ts` + Apple web-app meta tags, installs full screen

## Getting started

1. Create a free Supabase project.
2. Run each file in `supabase/migrations/` in order, pasting its contents into the SQL editor
   (or `supabase db push` with the CLI).
3. `cp .env.example .env.local` and fill in the project URL and anon key.
4. `npm install && npm run dev`, then open http://localhost:3000.

## Layout

```
supabase/
  migrations/01_schema.sql     tables, enums, triggers, RLS, RPCs (step 1)
  migrations/02_admin.sql      business name on sign-up, worker-photos bucket (step 2)
  migrations/03_function_grants.sql  owner-only functions not callable by anon
  tests/                       plain-Postgres behaviour tests for the migration
src/
  proxy.ts                     refreshes the owner's session, guards /admin
  app/
    manifest.ts                PWA manifest (step 5)
    login/                     owner sign-in and sign-up (step 2)
    auth/confirm/              sign-up email confirmation link
    admin/                     owner dashboard: live board (step 2)
      workers/                 add / edit workers, set PINs (step 2)
      khata/                   cash advances (step 2)
      payroll/                 salary report, ?from=&to= (default: this month)
      payroll/[workerId]/      printable A4 / phone salary slip
    punch/                     worker kiosk + personal phone mode (step 3)
    punch/login/               one-time phone + PIN login on a worker's own phone
  components/
    ui/                        shadcn/ui primitives
    admin/  punch/  payroll/   feature components
  lib/
    supabase/                  browser, server and proxy clients
    worker-session.ts          httpOnly cookie for personal-mode worker sessions
    format.ts                  minutes, rupees, month ranges
    admin/period.ts            pay period from ?from=&to=
  types/database.ts            typed schema + RPC result shapes
```

## The punch screen

Open the link from the owner's dashboard (`/punch?k=CODE`) once on each device. The code is
remembered in a cookie and removed from the address bar, so "Add to Home Screen" opens straight
to the punch screen.

- **Shared tablet:** worker taps their photo, enters their PIN, taps the big green CLOCK IN or
  red CLOCK OUT button, sees a full-screen confirmation for 3 seconds. A worker's screen goes
  back to the photo grid after 20 seconds without a tap.
- **Own phone:** "On your own phone? Log in once here" asks for phone number and PIN, then the
  phone stays logged in for 90 days (httpOnly cookie; changing the PIN logs it out).
- Labels have a short Hindi line under the English.

## How worker PINs stay safe

Workers have no Supabase Auth account and the `anon` role cannot read any table. Everything on
`/punch` goes through `SECURITY DEFINER` functions:

| Function | Who | What it returns |
| --- | --- | --- |
| `kiosk_list_workers(code)` | anon | business name + each worker's name, photo, clocked-in flag |
| `kiosk_verify_pin(code, worker, pin)` | anon | that worker's today + last 7 days |
| `kiosk_punch(code, worker, pin)` | anon | clock in or out, then the summary |
| `worker_login(code, phone, pin)` | anon | a 90-day session token for a personal phone |
| `worker_status(token)` / `worker_punch(token)` / `worker_logout(token)` | anon | same, by token |
| `set_worker_pin(worker, pin)` | owner | sets a bcrypt hash, clears lockout, logs out phones |
| `mark_attendance(worker, date, status)` | owner | manual Present / Half Day / Absent |
| `payroll_report(start, end)` | owner | one payroll row per worker |

- `code` is the owner's `owner_settings.kiosk_code`, a random 10-character code shared as a link
  (`/punch?k=CODE`) or QR. Without it nobody can even list a business's workers.
- PINs are bcrypt-hashed with pgcrypto. `pin_hash` is excluded from the owner's column grants,
  so even the admin dashboard can't read it.
- 5 wrong PINs lock that worker for 15 minutes.
- Session tokens are stored only as SHA-256 hashes.

## Payroll and salary slips

**Payroll** shows every worker for a month (arrows) or any date range up to a year: days
present, half days, OT hours, gross pay, advances deducted and net payable, with totals.
Shifts that are still clocked in are left out and flagged. **Slip** opens one worker's salary
slip with the pay worked out line by line, each advance, and every day's in/out times. Print
gives a clean A4 page with signature and thumb-impression lines; WhatsApp opens a chat with the
worker (or a contact picker if no phone is saved) with the summary filled in.

## Pay rules (in `payroll_report`)

| Type | Base | Overtime |
| --- | --- | --- |
| Daily | present = daily rate, half day = 50% | hours past the shift × OT rate |
| Hourly | regular hours × hourly rate | OT hours × OT rate (hourly rate if OT rate is 0) |
| Monthly | present = salary ÷ days in month, half day = 50% of that | OT hours × OT rate |

Net payable = gross − advances dated in the same range. A day's status is set when the worker
clocks out: a full shift is present, at least half a shift is half day, less is absent. The
owner's manual mark always wins.

## Database tests

With Postgres 16 installed locally (no Docker or Supabase CLI needed):

```
npm run db:test
```

It creates a scratch database, loads a small stand-in for Supabase's `auth` schema and roles,
applies the migration and runs `supabase/tests/schema_test.sql`.

## Email confirmation

Supabase asks new owners to confirm their email. For the link to sign them straight in, set
Auth → Email Templates → "Confirm signup" to link to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/admin
```

and set Auth → URL Configuration → Site URL to your Vercel URL.
