/** Holidays (08_holidays.sql): shared helpers for pages and components. */

import type { Holiday } from "@/types/database";

export type HolidayInfo = Pick<Holiday, "date" | "name" | "paid">;

/** Holidays by date ("yyyy-mm-dd"). */
export type HolidayMap = Map<string, HolidayInfo>;

export function holidayMap(rows: HolidayInfo[] | null | undefined): HolidayMap {
  return new Map((rows ?? []).map((h) => [h.date, h]));
}

/** India's three national holidays, the same date every year. */
export const NATIONAL_HOLIDAYS = [
  { monthDay: "01-26", name: "Republic Day" },
  { monthDay: "08-15", name: "Independence Day" },
  { monthDay: "10-02", name: "Gandhi Jayanti" },
] as const;

/** Name suggestions for the holiday form (dates change every year, so only names). */
export const HOLIDAY_SUGGESTIONS = [
  "Republic Day",
  "Independence Day",
  "Gandhi Jayanti",
  "Makar Sankranti",
  "Pongal",
  "Holi",
  "Good Friday",
  "Eid al-Fitr",
  "Eid al-Adha",
  "Muharram",
  "Raksha Bandhan",
  "Janmashtami",
  "Ganesh Chaturthi",
  "Onam",
  "Navratri",
  "Dussehra",
  "Diwali",
  "Bhai Dooj",
  "Chhath Puja",
  "Guru Nanak Jayanti",
  "Christmas",
  "New Year's Day",
];

/** Colours for a holiday, alongside the Present / Half day / Absent ones in day-state.ts. */
export const HOLIDAY_STYLE = {
  /** Solid chip or calendar square. */
  cell: "bg-violet-600 text-white",
  /** Soft box or banner. */
  soft: "bg-violet-500/10 text-violet-800 dark:text-violet-200",
  text: "text-violet-700 dark:text-violet-300",
  short: "H",
} as const;
