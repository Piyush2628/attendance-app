# Attendance & Salary

Attendance and payroll for small businesses, workshops and daily-wage / contract staff.
Employees clock in and out with a 4-digit PIN; the owner sees who is in today, looks back at
each employee's week, month or year, and prints salary slips. Runs entirely on free tiers: Next.js on Vercel and
Supabase.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui (new-york), Lucide icons
- Supabase: Postgres, Auth (owners only), Row Level Security, Realtime
- PWA: `src/app/manifest.ts`, `public/sw.js` (offline screen only) and Apple web-app meta tags; installs full screen

## Getting started

1. Create a free Supabase project.
2. Run each file in `supabase/migrations/` in order, pasting its contents into the SQL editor
   (or `supabase db push` with the CLI).
3. `cp .env.example .env.local` and fill in the project URL and anon key.
4. `npm install && npm run dev`, then open http://localhost:3000.

## Layout

Screens say "employee" everywhere. The database and code still use `worker` in table, column and
function names (`workers`, `worker_id`, `worker_login`, …), so no migration was needed for the
rename.

```
supabase/
  migrations/01_schema.sql     tables, enums, triggers, RLS, RPCs (step 1)
  migrations/02_admin.sql      business name on sign-up, worker-photos bucket (step 2)
  migrations/03_function_grants.sql  owner-only functions not callable by anon
  migrations/04_gps.sql        work location + radius, location stored on each punch
  tests/                       plain-Postgres behaviour tests for the migration
src/
  proxy.ts                     refreshes the owner's session, guards /admin
  app/
    manifest.ts                PWA manifest: opens on /punch, full screen, shortcuts
    login/                     owner sign-in and sign-up (step 2)
    auth/confirm/              sign-up email confirmation link
    admin/                     owner dashboard: live board (step 2)
      employees/               add / edit employees, set PINs
      attendance/              one employee's week / month / year (?e=&view=&d=)
      settings/                punch link, location check
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
    admin/calendar.ts          week / month / year ranges for the attendance page
  types/database.ts            typed schema + RPC result shapes
```

## The punch screen

Open the link from the owner's dashboard (`/punch?k=CODE`) once on each device. The code is
remembered in a cookie and removed from the address bar, so "Add to Home Screen" opens straight
to the punch screen.

- **Shared tablet:** employee taps their photo, enters their PIN, taps the big green CLOCK IN or
  red CLOCK OUT button, sees a full-screen confirmation for 3 seconds. An employee's screen goes
  back to the photo grid after 20 seconds without a tap.
- **Own phone:** "On your own phone? Log in once here" asks for phone number and PIN, then the
  phone stays logged in for 90 days (httpOnly cookie; changing the PIN logs it out).
- Labels have a short Hindi line under the English.

## Location check (GPS)

Off by default. On the Today page, the owner stands at the workplace, taps "Use my current
location" (or pastes coordinates from Google Maps), picks an allowed distance (200 m is a good
start) and ticks "Check location when employees punch".

- With the check on, every clock-in and clock-out, on the tablet or an employee's own phone,
  sends the browser's GPS fix. `do_punch` refuses it when it is farther than the allowed distance
  plus the fix's accuracy (counted up to 100 m), and refuses a punch with no location.
- Every punch that sent a location stores it (`clock_in_lat`, `clock_in_distance_m`, …). The Today
  board shows "In 44 m", linking to the spot on Google Maps, in red when outside the distance.
- The browser's location can be faked with mock-GPS apps. This check stops the everyday case
  (punching from home or on the way), not a determined cheat.

## Installing on phones and tablets

Open the punch link once on the device, then:

- **Android (Chrome, Samsung Internet):** tap **Install app** at the bottom of the punch screen.
  The app opens full screen on the punch screen. Long-press its icon for Dashboard and Payroll
  shortcuts.
- **iPhone / iPad (Safari):** tap **Add to Home Screen** for the three steps (Share → Add to Home
  Screen → Add).

While the kiosk screen is open it asks the browser to keep the display on. With no internet a red
banner appears, a punch attempt says nothing was saved, and pages that can't load show a simple
"No internet" screen that reloads itself when the connection returns. Nothing is cached, so
attendance and pay always come fresh from the database. The service worker only runs in
production builds (`npm run build && npm start`), not in `npm run dev`.

## How employee PINs stay safe

Employees have no Supabase Auth account and the `anon` role cannot read any table. Everything on
`/punch` goes through `SECURITY DEFINER` functions:

| Function | Who | What it returns |
| --- | --- | --- |
| `kiosk_list_workers(code)` | anon | business name + each employee's name, photo, clocked-in flag |
| `kiosk_verify_pin(code, worker, pin)` | anon | that employee's today + last 7 days |
| `kiosk_punch(code, worker, pin)` | anon | clock in or out, then the summary |
| `worker_login(code, phone, pin)` | anon | a 90-day session token for a personal phone |
| `worker_status(token)` / `worker_punch(token)` / `worker_logout(token)` | anon | same, by token |
| `set_worker_pin(worker, pin)` | owner | sets a bcrypt hash, clears lockout, logs out phones |
| `mark_attendance(worker, date, status)` | owner | manual Present / Half Day / Absent |
| `payroll_report(start, end)` | owner | one payroll row per employee |

- `code` is the owner's `owner_settings.kiosk_code`, a random 10-character code shared as a link
  (`/punch?k=CODE`) or QR. Without it nobody can even list a business's employees.
- PINs are bcrypt-hashed with pgcrypto. `pin_hash` is excluded from the owner's column grants,
  so even the admin dashboard can't read it.
- 5 wrong PINs lock that employee for 15 minutes.
- Session tokens are stored only as SHA-256 hashes.

## Payroll and salary slips

**Payroll** shows every employee for a month (arrows) or any date range up to a year: days
present, half days, OT hours, base pay, OT pay and salary, with totals. Shifts that are still
clocked in are left out and flagged. **Slip** opens one employee's salary slip with the pay
worked out line by line and every day's in/out times. Print
gives a clean A4 page with signature and thumb-impression lines; WhatsApp opens a chat with the
employee (or a contact picker if no phone is saved) with the summary filled in.

## Pay rules (in `payroll_report`)

| Type | Base | Overtime |
| --- | --- | --- |
| Daily | present = daily rate, half day = 50% | hours past the shift × OT rate |
| Hourly | regular hours × hourly rate | OT hours × OT rate (hourly rate if OT rate is 0) |
| Monthly | present = salary ÷ days in month, half day = 50% of that | OT hours × OT rate |

The business gives no cash advances, so the app has no advances screen and salary is the gross
pay. (The `advances` table and the `advances_total` / `net_payable` columns of `payroll_report`
are still in the database, unused.) A day's status is set when the employee
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

Supabase asks new owners to confirm their email. Set Auth → URL Configuration → **Site URL** to
your Vercel URL (for example `https://attendance-app.vercel.app`) so the link in that email opens
your app. The default "Confirm signup" email template works as is; the link signs the owner
straight in to the dashboard.
