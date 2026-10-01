"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, LogIn, LogOut, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "@/components/worker-avatar";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkerSummary } from "@/types/database";

function time(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–";
}

/** Live "today" minutes. Uses the server clock offset so a wrong device clock doesn't matter. */
function useTodayMinutes(summary: WorkerSummary) {
  const [now, setNow] = useState(() => Date.now());
  const [offset] = useState(() => new Date(summary.server_time).getTime() - Date.now());
  useEffect(() => {
    if (!summary.clocked_in) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [summary.clocked_in]);
  if (!summary.clocked_in || !summary.clock_in_at) return { minutes: summary.today_minutes, seconds: 0 };
  const elapsed = Math.max(0, now + offset - new Date(summary.clock_in_at).getTime());
  return { minutes: Math.floor(elapsed / 60_000), seconds: Math.floor((elapsed % 60_000) / 1000) };
}

const STATUS_STYLE = {
  present: "bg-punch-in/15 text-punch-in",
  half_day: "bg-amber-500/15 text-amber-700",
  absent: "bg-punch-out/15 text-punch-out",
} as const;
const STATUS_LABEL = { present: "Full day", half_day: "Half day", absent: "Absent" } as const;

/**
 * The worker's screen: who they are, a giant green CLOCK IN or red CLOCK OUT
 * button, today's hours and the last 7 days.
 */
export function WorkerPanel({
  summary,
  busy,
  onPunch,
  footer,
}: {
  summary: WorkerSummary;
  /** "location" while waiting for a GPS fix, "punch" while saving. */
  busy: false | "punch" | "location";
  onPunch: () => void;
  footer?: React.ReactNode;
}) {
  const { minutes, seconds } = useTodayMinutes(summary);
  const clockedIn = summary.clocked_in;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5">
      <div className="flex items-center gap-3 self-stretch">
        <WorkerAvatar name={summary.worker.name} photoUrl={summary.worker.photo_url} className="size-16 text-xl" />
        <div className="min-w-0">
          <div className="truncate text-2xl font-bold">{summary.worker.name}</div>
          <div className={cn("font-medium", clockedIn ? "text-punch-in" : "text-muted-foreground")}>
            {clockedIn ? `Working since ${time(summary.clock_in_at)}` : "Not working now"}
          </div>
        </div>
      </div>

      <Button
        variant={clockedIn ? "punchOut" : "punchIn"}
        size="giant"
        className="h-48 flex-col gap-1"
        disabled={Boolean(busy)}
        onClick={onPunch}
      >
        {busy ? (
          <>
            <Loader2 className="size-14 animate-spin" />
            {busy === "location" && <span className="text-xl font-semibold">Finding your location…</span>}
          </>
        ) : (
          <>
            <span className="flex items-center gap-3">
              {clockedIn ? <LogOut className="size-12" /> : <LogIn className="size-12" />}
              {clockedIn ? "CLOCK OUT" : "CLOCK IN"}
            </span>
            <span className="text-2xl font-semibold opacity-90">{clockedIn ? "छुट्टी" : "हाज़िरी"}</span>
          </>
        )}
      </Button>
      {summary.gps_required && (
        <p className="text-muted-foreground -mt-2 flex items-center gap-1 text-sm">
          <MapPin className="size-4" /> Punch from the workplace · काम की जगह से ही पंच करें
        </p>
      )}
      {summary.selfie_required && (
        <p className="text-muted-foreground -mt-2 flex items-center gap-1 text-sm">
          <Camera className="size-4" /> A photo is taken when you punch · पंच पर फ़ोटो ली जाएगी
        </p>
      )}

      <div className="bg-muted w-full rounded-2xl p-4 text-center">
        <div className="text-muted-foreground text-sm font-medium">Today&apos;s hours · आज</div>
        <div className="font-mono text-5xl font-bold tabular-nums">
          {Math.floor(minutes / 60)}:{String(minutes % 60).padStart(2, "0")}
          {clockedIn && <span className="text-muted-foreground text-3xl">:{String(seconds).padStart(2, "0")}</span>}
        </div>
      </div>

      <div className="w-full">
        <div className="text-muted-foreground mb-2 text-sm font-medium">Last 7 days</div>
        {summary.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No attendance yet.</p>
        ) : (
          <ul className="divide-y rounded-2xl border">
            {summary.history.map((h) => (
              <li key={h.date} className="flex items-center gap-3 px-3 py-2">
                <div className="w-20 shrink-0">
                  <div className="font-semibold">
                    {new Date(`${h.date}T00:00:00`).toLocaleDateString([], { weekday: "short" })}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(`${h.date}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </div>
                </div>
                <div className="text-muted-foreground min-w-0 flex-1 text-sm">
                  {h.clock_in ? `${time(h.clock_in)} – ${h.clock_out ? time(h.clock_out) : "…"}` : "Marked by owner"}
                  {h.total_minutes != null && <div className="text-foreground font-medium">{formatMinutes(h.total_minutes)}</div>}
                </div>
                {(h.clock_out || !h.clock_in) && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[h.status])}>
                    {STATUS_LABEL[h.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </div>
  );
}
