"use server";

import { revalidatePath } from "next/cache";

import { isIsoDate } from "@/lib/admin/calendar";
import { requireOwner } from "@/lib/admin/data";
import { NATIONAL_HOLIDAYS } from "@/lib/holidays";

export type HolidayState = { ok?: boolean; error?: string; savedAt?: number };

/**
 * Add a holiday, or change one (`original_date` is the date it had before).
 * Saving re-reads every page, since attendance and payroll depend on holidays.
 */
export async function saveHoliday(_prev: HolidayState, formData: FormData): Promise<HolidayState> {
  const original = String(formData.get("original_date") ?? "") || null;
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const paid = formData.get("paid") !== "false";

  if (!isIsoDate(date)) return { error: "Choose a date." };
  if (original && !isIsoDate(original)) return { error: "Choose a date." };
  if (!name) return { error: "Enter the holiday's name, like Diwali." };
  if (name.length > 60) return { error: "Keep the name under 60 letters." };

  const { supabase, settings } = await requireOwner();
  const { error } = original
    ? await supabase.from("holidays").update({ date, name, paid }).eq("owner_id", settings.owner_id).eq("date", original)
    : await supabase.from("holidays").insert({ owner_id: settings.owner_id, date, name, paid });
  if (error) {
    return { error: error.code === "23505" ? "There is already a holiday on that date." : error.message };
  }

  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}

export async function deleteHoliday(date: string): Promise<HolidayState> {
  if (!isIsoDate(date)) return { error: "Choose a date." };
  const { supabase, settings } = await requireOwner();
  const { error } = await supabase.from("holidays").delete().eq("owner_id", settings.owner_id).eq("date", date);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}

/** Republic Day, Independence Day and Gandhi Jayanti for one year, as paid holidays. Keeps any already there. */
export async function addNationalHolidays(year: number): Promise<HolidayState> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Choose a year." };
  const { supabase, settings } = await requireOwner();
  const rows = NATIONAL_HOLIDAYS.map((h) => ({
    owner_id: settings.owner_id,
    date: `${year}-${h.monthDay}`,
    name: h.name,
    paid: true,
  }));
  const { error } = await supabase
    .from("holidays")
    .upsert(rows, { onConflict: "owner_id,date", ignoreDuplicates: true });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}
