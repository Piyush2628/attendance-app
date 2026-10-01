"use client";

import { useEffect, useState } from "react";
import { Delete, X } from "lucide-react";

import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

/**
 * Big 4-digit keypad. Calls onComplete as soon as the 4th digit is entered.
 * `errorKey` changes on every failed attempt: the dots shake and reset.
 */
export function PinPad({
  onComplete,
  busy,
  errorKey,
}: {
  onComplete: (pin: string) => void;
  busy?: boolean;
  errorKey?: number;
}) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!errorKey) return;
    // Reset after a wrong PIN; the shake is purely visual feedback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPin("");
    setShake(true);
    navigator.vibrate?.(200);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [errorKey]);

  function press(key: (typeof KEYS)[number]) {
    if (busy) return;
    if (key === "clear") return setPin("");
    if (key === "back") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) onComplete(next);
  }

  // Physical keyboards (tablet with keyboard, desktop testing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <div className={cn("flex gap-4", shake && "animate-[shake_0.4s_ease-in-out]")} aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-5 rounded-full border-2 border-current transition-colors",
              i < pin.length ? "bg-current" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => press(key)}
            aria-label={key === "back" ? "Delete" : key === "clear" ? "Clear" : key}
            className={cn(
              "flex h-18 items-center justify-center rounded-2xl text-3xl font-semibold select-none active:scale-95 disabled:opacity-50",
              key === "clear" || key === "back" ? "text-muted-foreground" : "bg-muted active:bg-muted-foreground/20",
            )}
          >
            {key === "back" ? <Delete className="size-8" /> : key === "clear" ? <X className="size-8" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}
