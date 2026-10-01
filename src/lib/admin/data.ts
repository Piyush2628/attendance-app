import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { isoDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceLog, OwnerSettings, Worker } from "@/types/database";

/**
 * Supabase client + the signed-in owner's settings. Redirects to /login if signed out.
 * Cached per request, so the layout and the page share one auth check and one settings read.
 */
export const requireOwner = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { data: settings } = await supabase
    .from("owner_settings")
    .select("*")
    .single<OwnerSettings>();
  if (!settings) throw new Error("Owner settings missing. Was 01_schema.sql applied?");

  return { supabase, settings, today: isoDate(new Date(), settings.timezone) };
});

export type BoardState = "in" | "done" | "marked" | "not_in";

export type BoardRow = {
  worker: Pick<Worker, "id" | "name" | "photo_url" | "work_start" | "work_end">;
  log: AttendanceLog | null;
  /** An open punch from yesterday's night shift counts as "in" today. */
  openLog: AttendanceLog | null;
  state: BoardState;
  /** Selfie ids for the shown punch (open or today's), for /admin/selfie/[id]. */
  selfies: SelfieIds;
};

export type SelfieIds = { in?: string; out?: string };

/** Selfie ids by attendance log id (no image data; the images load from /admin/selfie/[id]). */
export async function getSelfieIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  logIds: string[],
): Promise<Map<string, SelfieIds>> {
  const byLog = new Map<string, SelfieIds>();
  if (logIds.length === 0) return byLog;
  const { data, error } = await supabase.from("punch_selfies").select("id, log_id, kind").in("log_id", logIds);
  if (error) throw error;
  for (const s of data) byLog.set(s.log_id, { ...byLog.get(s.log_id), [s.kind]: s.id });
  return byLog;
}

const OPEN_WINDOW_MS = 20 * 60 * 60 * 1000; // matches do_punch() in 01_schema.sql

export async function getTodayBoard() {
  const { supabase, settings, today } = await requireOwner();

  const since = new Date(Date.now() - OPEN_WINDOW_MS).toISOString();
  const [workers, logs, open] = await Promise.all([
    supabase
      .from("workers")
      .select("id, name, photo_url, work_start, work_end")
      .eq("is_active", true)
      .order("name"),
    supabase.from("attendance_logs").select("*").eq("date", today),
    supabase
      .from("attendance_logs")
      .select("*")
      .is("clock_out", null)
      .not("clock_in", "is", null)
      .gt("clock_in", since),
  ]);
  if (workers.error) throw workers.error;
  if (logs.error) throw logs.error;
  if (open.error) throw open.error;

  const todayByWorker = new Map(logs.data.map((l) => [l.worker_id, l]));
  const openByWorker = new Map(open.data.map((l) => [l.worker_id, l]));

  const selfies = await getSelfieIds(supabase, [...new Set([...logs.data, ...open.data].map((l) => l.id))]);

  const rows: BoardRow[] = workers.data.map((worker) => {
    const log = todayByWorker.get(worker.id) ?? null;
    const openLog = openByWorker.get(worker.id) ?? null;
    let state: BoardState = "not_in";
    if (openLog) state = "in";
    else if (log?.clock_out) state = "done";
    else if (log?.manual_override) state = "marked";
    const shown = state === "in" ? openLog : log;
    return { worker, log, openLog, state, selfies: (shown && selfies.get(shown.id)) ?? {} };
  });

  return { settings, today, rows };
}
