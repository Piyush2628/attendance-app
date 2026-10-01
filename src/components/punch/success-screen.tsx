"use client";

import { useEffect } from "react";
import { CircleCheckBig } from "lucide-react";

import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Full-screen confirmation that closes itself after 3 seconds (or on tap). */
export function SuccessScreen({
  action,
  at,
  name,
  totalMinutes,
  onDone,
}: {
  action: "clock_in" | "clock_out";
  at: string;
  name: string;
  totalMinutes?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    navigator.vibrate?.(80);
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const isIn = action === "clock_in";
  return (
    <button
      type="button"
      onClick={onDone}
      className={cn(
        "animate-in fade-in zoom-in-95 fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center text-white",
        isIn ? "bg-punch-in" : "bg-punch-out",
      )}
    >
      <CircleCheckBig className="size-48" strokeWidth={2.5} />
      <div className="text-4xl font-extrabold">{isIn ? "CLOCKED IN" : "CLOCKED OUT"}</div>
      <div className="text-2xl font-semibold">{isIn ? "हाज़िरी लग गई" : "छुट्टी हो गई"}</div>
      <div className="text-6xl font-bold tabular-nums">
        {new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </div>
      <div className="text-xl">
        {name}
        {!isIn && totalMinutes != null && ` · ${formatMinutes(totalMinutes)} today`}
      </div>
      {/* 3 second countdown bar */}
      <div className="absolute inset-x-0 bottom-0 h-2 origin-left animate-[shrink_3s_linear_forwards] bg-white/60" />
    </button>
  );
}
