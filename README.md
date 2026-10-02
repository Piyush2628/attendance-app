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
  migrations/05_timings_selfies.sql  optional work timings, off days, punch selfies
  tests/                       plain-Postgres behaviour tests for the migration
src/
  proxy.ts                     refreshes the owner's session, guards /admin
  app/
    manifest.ts                PWA manifest: opens on /start, full screen, shortcuts
    login/                     owner sign-in and sign-up (step 2)
    auth/confirm/              sign-up email confirmation link
    admin/                     owner dashboard: live board (step 2)
      employees/               add / edit employees, set PINs
      attendance/              one employee's week / month / year (?e=&view=&d=); add, edit, delete days
      selfie/[id]/             a punch selfie as a JPEG (owner only, by RLS)
      settings/                punch link, work timings, location check, selfie
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
    timing.ts                  work timings, off days, owner-time-zone conversions
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

Off by default. On the Settings page (gear icon), the owner stands at the workplace, taps "Use my current
location" (or pastes coordinates from Google Maps), picks an allowed distance (200 m is a good
start) and ticks "Check location when employees punch".

- With the check on, every clock-in and clock-out, on the tablet or an employee's own phone,
  sends the browser's GPS fix. `do_punch` refuses it when it is farther than the allowed distance
  plus the fix's accuracy (counted up to 100 m), and refuses a punch with no location.
- Every punch that sent a location stores it (`clock_in_lat`, `clock_in_distance_m`, …). The Today
  board shows "In 44 m", linking to the spot on Google Maps, in red when outside the distance.
- The browser's location can be faked with mock-GPS apps. This check stops the everyday case
  (punching from home or on the way), not a determined cheat.

## Work timings and off days

Both optional, on the Settings page.

- **Business timing** (e.g. 10:30 AM to 7:30 PM). An employee can have their own timing instead
  (part time), set in their Employees form. With a timing, a day is present when they worked at
  least the timing minus 30 minutes, half day at half of it, absent below that; overtime is time
  past the timing, and clocking in more than 10 minutes after the start shows a "Late" tag.
  Timings past midnight (night shift) work.
- **No timing at all:** any day the employee clocks in and out is a full day, with no overtime.
- **Off days** (Sunday by default): punches are still recorded and shown, but left out of the
  salary. A monthly salary is divided over the month's working days (days that aren't off days).

Changing a timing applies to punches from then on; past days keep their status.

## Selfie at punch

Off by default; turn it on in Settings. Every clock-in and clock-out then opens the front camera,
counts down 3 seconds and takes a 320×320 JPEG (about 15–25 KB). The photo is stored in the
`punch_selfies` table, not in Storage, and every punch deletes photos older than 45 days, so the
database stays small without a scheduled job. The Today board and the Attendance page show the
photos; tap one to open it.

## Correcting attendance

On the Today page, the bin icon deletes an employee's entry for today (tap twice). On the Attendance page
and on each salary slip, the pencil next to a day edits its in/out times (in the business time
zone; an out time before the in time is the next morning), sets a fixed status, adds a note, or
deletes the day. "Add day" enters a day that has no punch.

## Installing on phones and tablets

Open the punch link once on the device, then:

- **Android (Chrome, Samsung Internet):** tap **Install app** at the bottom of the punch screen.
  The app opens full screen on the punch screen. Long-press its icon for Dashboard and Payroll
  shortcuts.
- **iPhone / iPad (Safari):** tap **Add to Home Screen** for the three steps (Share → Add to Home
  Screen → Add).

The installed app opens on `/start`: the dashboard when the owner is signed in on that device,
the punch screen otherwise. The punch screens have an **Owner login** link at the bottom, so the
owner can sign in from the installed app. After signing out, the app opens on the punch screen again.

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
| `kiosk_punch(code, worker, pin, lat, lng, accuracy, selfie)` | anon | clock in or out, then the summary |
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
| Daily | present = daily rate, half day = 50% | hours past the timing × OT rate |
| Hourly | regular hours × hourly rate | OT hours × OT rate (hourly rate if OT rate is 0) |
| Monthly | present = salary ÷ working days in month, half day = 50% of that | OT hours × OT rate |

The business gives no cash advances, so the app has no advances screen and salary is the gross
pay. (The `advances` table and the `advances_total` / `net_payable` columns of `payroll_report`
are still in the database, unused.) A day's status is set when the employee
clocks out, by the work timing rules above. Off days are left out. The owner's manual mark
always wins.

## Speed

`vercel.json` runs the server functions in Seoul (`icn1`), the same region as the Supabase project
(`ap-northeast-2`). Each page makes a few database calls, so keeping them in one region matters
far more than anything else. If the Supabase project ever moves, change the region to match.

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
