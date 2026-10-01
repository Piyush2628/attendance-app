import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { isoDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceLog, OwnerSettings, Worker } from "@/types/database";

/**
 * Supabase client + the signed-in owner's settings. Redirects to /login if signed out.
 * Cached per request, so the layout and the page share one settings read.
 *
 * One round trip: row-level security returns only the signed-in owner's row
 * (and nothing when signed out), so the auth check happens only when that
 * read comes back empty. proxy.ts has already checked the session.
 */
export const requireOwner = cache(async () => {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("owner_settings")
    .select("*")
    .maybeSingle<OwnerSettings>();
  if (!settings) {
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) redirect("/login");
    throw new Error("Owner settings missing. Was 01_schema.sql applied?");
  }

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

/** Embed this in an attendance_logs select to get the day's selfie ids in the same query. */
export const SELFIE_IDS = "punch_selfies(id, kind)";

/** Selfie ids of one log, from the embedded punch_selfies rows. */
export function selfieIds(rows: { id: string; kind: string }[] | null | undefined): SelfieIds {
  const out: SelfieIds = {};
  for (const s of rows ?? []) if (s.kind === "in" || s.kind === "out") out[s.kind] = s.id;
  return out;
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
    supabase.from("attendance_logs").select(`*, ${SELFIE_IDS}`).eq("date", today),
    supabase
      .from("attendance_logs")
      .select(`*, ${SELFIE_IDS}`)
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
    const shown = state === "in" ? openLog : log;
    return { worker, log, openLog, state, selfies: selfieIds(shown?.punch_selfies) };
  });

  return { settings, today, rows };
}
