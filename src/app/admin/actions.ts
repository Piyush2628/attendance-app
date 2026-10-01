"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/admin/data";
import { parseCoordinates } from "@/lib/geo";
import { readTimingPair } from "@/lib/timing";
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

export type WorkLocationState = { ok?: boolean; error?: string; savedAt?: number };

/** Work location + radius for the GPS check on punches (04_gps.sql). */
export async function saveWorkLocation(_prev: WorkLocationState, formData: FormData): Promise<WorkLocationState> {
  const coordsText = String(formData.get("coords") ?? "").trim();
  const radius = Math.round(Number(formData.get("radius")));
  const gpsRequired = formData.get("gps_required") === "on";

  const coords = coordsText ? parseCoordinates(coordsText) : null;
  if (coordsText && !coords) {
    return { error: "Location not understood. Tap “Use my current location”, or paste it like 28.6139, 77.2090." };
  }
  if (gpsRequired && !coords) return { error: "Set the work location first." };
  if (!Number.isFinite(radius) || radius < 20 || radius > 5000) return { error: "Choose a distance." };

  const { supabase, settings } = await requireOwner();
  const { error } = await supabase
    .from("owner_settings")
    .update({
      work_lat: coords?.lat ?? null,
      work_lng: coords?.lng ?? null,
      work_radius_m: radius,
      gps_required: gpsRequired,
    })
    .eq("owner_id", settings.owner_id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, savedAt: Date.now() };
}

export type SettingsState = { ok?: boolean; error?: string; savedAt?: number };

/** Optional business work timing and the off days left out of salary (05_timings_selfies.sql). */
export async function saveWorkTimings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const timing = readTimingPair(formData);
  if ("error" in timing) return { error: timing.error };
  const offDays = formData
    .getAll("off_days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  const { supabase, settings } = await requireOwner();
  const { error } = await supabase
    .from("owner_settings")
    .update({ ...timing, off_days: [...new Set(offDays)].sort() })
    .eq("owner_id", settings.owner_id);
  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}

/** Turn the selfie-at-punch requirement on or off. */
export async function saveSelfieRequired(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase, settings } = await requireOwner();
  const { error } = await supabase
    .from("owner_settings")
    .update({ selfie_required: formData.get("selfie_required") === "on" })
    .eq("owner_id", settings.owner_id);
  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}
