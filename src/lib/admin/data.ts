import "server-only";

import { redirect } from "next/navigation";

import { isoDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceLog, OwnerSettings, Worker } from "@/types/database";

/** Supabase client + the signed-in owner's settings. Redirects to /login if signed out. */
export async function requireOwner() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { data: settings } = await supabase
    .from("owner_settings")
    .select("*")
    .single<OwnerSettings>();
  if (!settings) throw new Error("Owner settings missing. Was 01_schema.sql applied?");

  return { supabase, settings, today: isoDate(new Date(), settings.timezone) };
}

export type BoardState = "in" | "done" | "marked" | "not_in";

export type BoardRow = {
  worker: Pick<Worker, "id" | "name" | "photo_url" | "standard_shift_hours">;
  log: AttendanceLog | null;
  /** An open punch from yesterday's night shift counts as "in" today. */
  openLog: AttendanceLog | null;
  state: BoardState;
};

const OPEN_WINDOW_MS = 20 * 60 * 60 * 1000; // matches do_punch() in 01_schema.sql

export async function getTodayBoard() {
  const { supabase, settings, today } = await requireOwner();

  const since = new Date(Date.now() - OPEN_WINDOW_MS).toISOString();
  const [workers, logs, open] = await Promise.all([
    supabase
      .from("workers")
      .select("id, name, photo_url, standard_shift_hours")
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

  const rows: BoardRow[] = workers.data.map((worker) => {
    const log = todayByWorker.get(worker.id) ?? null;
    const openLog = openByWorker.get(worker.id) ?? null;
    let state: BoardState = "not_in";
    if (openLog) state = "in";
    else if (log?.clock_out) state = "done";
    else if (log?.manual_override) state = "marked";
    return { worker, log, openLog, state };
  });

  return { settings, today, rows };
}
