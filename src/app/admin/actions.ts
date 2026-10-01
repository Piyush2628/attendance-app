"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/admin/data";
import type { AttendanceStatus } from "@/types/database";

const STATUSES: AttendanceStatus[] = ["present", "half_day", "absent"];

/** One-tap manual mark for today (owner's timezone). */
export async function markToday(workerId: string, status: AttendanceStatus) {
  if (!STATUSES.includes(status)) return { error: "Unknown status" };
  const { supabase, today } = await requireOwner();
  const { error } = await supabase.rpc("mark_attendance", {
    p_worker_id: workerId,
    p_date: today,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/** Undo a manual mark that has no real punch behind it. */
export async function clearTodayMark(workerId: string) {
  const { supabase, today } = await requireOwner();
  const { error } = await supabase
    .from("attendance_logs")
    .delete()
    .eq("worker_id", workerId)
    .eq("date", today)
    .eq("manual_override", true)
    .is("clock_in", null);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/** Close a forgotten open punch at the current time. */
export async function clockOutNow(logId: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("attendance_logs")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", logId)
    .is("clock_out", null);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}
