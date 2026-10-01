"use server";

import { revalidatePath } from "next/cache";

import { isIsoDate } from "@/lib/admin/calendar";
import { requireOwner } from "@/lib/admin/data";
import { zonedDate } from "@/lib/timing";
import type { AttendanceStatus } from "@/types/database";

export type DayState = { ok?: boolean; error?: string; savedAt?: number };

const STATUSES: (AttendanceStatus | "auto")[] = ["auto", "present", "half_day", "absent"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Owner adds or corrects one attendance day. In/out are times in the owner's
 * time zone; an out time earlier than the in time is the next morning (night
 * shift). "auto" lets the timing rules decide the status from the hours;
 * any other status is a manual mark that the hours don't change.
 */
export async function saveDay(_prev: DayState, formData: FormData): Promise<DayState> {
  const logId = String(formData.get("log_id") ?? "") || null;
  const workerId = String(formData.get("worker_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const inTime = String(formData.get("in") ?? "").trim();
  const outTime = String(formData.get("out") ?? "").trim();
  const status = String(formData.get("status") ?? "auto") as AttendanceStatus | "auto";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;

  if (!isIsoDate(date)) return { error: "Choose a date." };
  if (!STATUSES.includes(status)) return { error: "Choose a status." };
  if ((inTime && !TIME.test(inTime)) || (outTime && !TIME.test(outTime))) return { error: "Check the times." };
  if (outTime && !inTime) return { error: "Enter the in time too." };
  if (!inTime && status === "auto") return { error: "Enter the in time, or choose Present, Half day or Absent." };

  const { supabase, settings, today } = await requireOwner();
  if (date > today) return { error: "That date is in the future." };

  let clockIn: string | null = null;
  let clockOut: string | null = null;
  if (inTime) {
    const start = zonedDate(date, inTime, settings.timezone);
    clockIn = start.toISOString();
    if (outTime) {
      let end = zonedDate(date, outTime, settings.timezone);
      if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      clockOut = end.toISOString();
    }
  }

  const values = {
    clock_in: clockIn,
    clock_out: clockOut,
    manual_override: status !== "auto",
    status: status === "auto" ? ("present" as const) : status,
    notes,
  };

  if (logId) {
    const { error } = await supabase.from("attendance_logs").update(values).eq("id", logId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("attendance_logs").insert({ ...values, worker_id: workerId, date });
    if (error) {
      return { error: error.code === "23505" ? "This day already has attendance. Edit it instead." : error.message };
    }
  }

  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}

/** Delete one attendance day (and its selfies). */
export async function deleteDay(logId: string): Promise<DayState> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("attendance_logs").delete().eq("id", logId);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}
