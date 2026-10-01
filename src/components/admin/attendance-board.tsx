"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, LogOut, MapPin, Minus, Trash2, Undo2, X } from "lucide-react";

import { clearTodayMark, clockOutNow, markToday } from "@/app/admin/actions";
import { deleteDay } from "@/app/admin/attendance/actions";
import { LateTag, SelfieThumbs } from "@/components/attendance/punch-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "@/components/worker-avatar";
import type { BoardRow } from "@/lib/admin/data";
import { formatMinutes } from "@/lib/format";
import { formatDistance, mapsUrl } from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/types/database";

function timeOf(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Re-render the server data whenever any attendance row this owner can see changes. */
function useLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("attendance-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () =>
        router.refresh(),
      )
      .subscribe();
    // Fallback for networks that block websockets.
    const poll = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [router]);
}

const STATUS_BADGE: Record<AttendanceStatus, { label: string; variant: "present" | "halfDay" | "absent" }> = {
  present: { label: "Present", variant: "present" },
  half_day: { label: "Half day", variant: "halfDay" },
  absent: { label: "Absent", variant: "absent" },
};

export function AttendanceBoard({ rows, timeZone, radiusM }: { rows: BoardRow[]; timeZone: string; radiusM: number }) {
  useLiveRefresh();
  const now = useNow();

  const counts = {
    in: rows.filter((r) => r.state === "in").length,
    done: rows.filter((r) => r.state === "done").length,
    notIn: rows.filter((r) => r.state === "not_in").length,
  };

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
        No employees yet. Add them on the Employees tab.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Working now" value={counts.in} className="bg-punch-in/10 text-punch-in" />
        <Stat label="Clocked out" value={counts.done} className="bg-sky-500/10 text-sky-700" />
        <Stat label="Not in" value={counts.notIn} className="bg-punch-out/10 text-punch-out" />
      </div>
      <ul className="grid grid-cols-1 gap-2">
        {rows.map((row) => (
          <BoardItem key={row.worker.id} row={row} now={now} timeZone={timeZone} radiusM={radiusM} />
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("rounded-xl p-3", className)}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

/** Where a punch happened: distance from work (red when outside the allowed distance), links to the map. */
function PunchPlace({
  label,
  lat,
  lng,
  distance,
  radiusM,
}: {
  label: string;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  radiusM: number;
}) {
  if (lat == null || lng == null) return null;
  const far = distance != null && distance > radiusM;
  return (
    <a
      href={mapsUrl(lat, lng)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 text-xs underline-offset-2 hover:underline",
        far ? "text-punch-out font-semibold" : "text-muted-foreground",
      )}
      title={`${label} location`}
    >
      <MapPin className="size-3" />
      {label} {distance != null ? formatDistance(distance) : "map"}
      {far && " away"}
    </a>
  );
}

function BoardItem({ row, now, timeZone, radiusM }: { row: BoardRow; now: number; timeZone: string; radiusM: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { worker, log, openLog, state, selfies } = row;
  const shown = state === "in" ? openLog : log;

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.error ?? null);
    });

  let detail: React.ReactNode;
  if (state === "in" && openLog?.clock_in) {
    const mins = Math.floor((now - new Date(openLog.clock_in).getTime()) / 60_000);
    detail = (
      <span className="text-punch-in flex items-center gap-1 font-medium">
        <Clock className="size-3.5" /> In since {timeOf(openLog.clock_in, timeZone)} · {formatMinutes(mins)}
      </span>
    );
  } else if (state === "done" && log) {
    detail = (
      <span className="text-muted-foreground">
        {timeOf(log.clock_in, timeZone)} to {timeOf(log.clock_out, timeZone)} · {formatMinutes(log.total_minutes)}
        {log.ot_minutes > 0 && ` (OT ${formatMinutes(log.ot_minutes)})`}
      </span>
    );
  } else if (state === "marked") {
    detail = <span className="text-muted-foreground">Marked by you{log?.notes ? `: ${log.notes}` : ""}</span>;
  } else {
    detail = <span className="text-punch-out font-medium">Not clocked in</span>;
  }

  const badge = log && state !== "in" ? STATUS_BADGE[log.status] : null;
  const markedManually = log?.manual_override;

  return (
    <li
      className={cn(
        "bg-card flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
        state === "in" && "border-punch-in/50",
        pending && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative">
          <WorkerAvatar name={worker.name} photoUrl={worker.photo_url} />
          <span
            className={cn(
              "border-background absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-2",
              state === "in" ? "bg-punch-in" : state === "not_in" ? "bg-punch-out" : "bg-sky-500",
            )}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/attendance?e=${worker.id}`} prefetch={false} className="truncate font-semibold underline-offset-2 hover:underline">
              {worker.name}
            </Link>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            <LateTag minutes={shown?.late_minutes} />
          </div>
          <div className="text-sm">{detail}</div>
          {(() => {
            const punch = state === "in" ? openLog : state === "done" ? log : null;
            if (!punch || (punch.clock_in_lat == null && punch.clock_out_lat == null)) return null;
            return (
              <div className="flex flex-wrap gap-x-3">
                <PunchPlace
                  label="In"
                  lat={punch.clock_in_lat}
                  lng={punch.clock_in_lng}
                  distance={punch.clock_in_distance_m}
                  radiusM={radiusM}
                />
                <PunchPlace
                  label="Out"
                  lat={punch.clock_out_lat}
                  lng={punch.clock_out_lng}
                  distance={punch.clock_out_distance_m}
                  radiusM={radiusM}
                />
              </div>
            );
          })()}
          {error && <div className="text-destructive text-xs">{error}</div>}
        </div>
        <SelfieThumbs selfies={selfies} name={worker.name} />
      </div>

      <div className="flex flex-wrap gap-2 sm:justify-end">
        {state === "in" && openLog ? (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clockOutNow(openLog.id))}>
              <LogOut /> Clock out now
            </Button>
            <DeleteButton disabled={pending} onConfirm={() => run(() => deleteDay(openLog.id))} />
          </>
        ) : (
          <>
            <MarkButton
              active={markedManually && log?.status === "present"}
              disabled={pending}
              onClick={() => run(() => markToday(worker.id, "present"))}
              className="data-[active=true]:bg-punch-in data-[active=true]:text-punch-in-foreground"
            >
              <Check /> Present
            </MarkButton>
            <MarkButton
              active={markedManually && log?.status === "half_day"}
              disabled={pending}
              onClick={() => run(() => markToday(worker.id, "half_day"))}
              className="data-[active=true]:bg-amber-500 data-[active=true]:text-white"
            >
              <Minus /> Half day
            </MarkButton>
            <MarkButton
              active={markedManually && log?.status === "absent"}
              disabled={pending}
              onClick={() => run(() => markToday(worker.id, "absent"))}
              className="data-[active=true]:bg-punch-out data-[active=true]:text-punch-out-foreground"
            >
              <X /> Absent
            </MarkButton>
            {state === "done" && log && (
              <DeleteButton disabled={pending} onConfirm={() => run(() => deleteDay(log.id))} />
            )}
            {state === "marked" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label="Undo mark"
                onClick={() => run(() => clearTodayMark(worker.id))}
              >
                <Undo2 />
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function MarkButton({
  active,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return <Button size="sm" variant="outline" data-active={Boolean(active)} className={className} {...props} />;
}

/** Deletes today's entry after a second tap (the first tap asks "Delete?"). */
function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <Button
      size="sm"
      variant={armed ? "destructive" : "ghost"}
      disabled={disabled}
      aria-label={armed ? "Tap again to delete" : "Delete entry"}
      className={cn(!armed && "text-destructive")}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      <Trash2 />
      {armed && "Delete?"}
    </Button>
  );
}
