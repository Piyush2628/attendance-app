"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";

import { kioskPunch, kioskVerify, listKioskWorkers } from "@/app/punch/actions";
import { errorMessage } from "@/components/punch/messages";
import { PinPad } from "@/components/punch/pin-pad";
import { SuccessScreen } from "@/components/punch/success-screen";
import { WorkerPanel } from "@/components/punch/worker-panel";
import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "@/components/worker-avatar";
import { cn } from "@/lib/utils";
import type { PunchError, WorkerSummary } from "@/types/database";

type KioskWorker = { id: string; name: string; photo_url: string | null; clocked_in: boolean };

type Step =
  | { kind: "grid" }
  | { kind: "pin"; worker: KioskWorker }
  | { kind: "panel"; worker: KioskWorker; pin: string; summary: WorkerSummary }
  | { kind: "done"; name: string; action: "clock_in" | "clock_out"; at: string; totalMinutes?: number };

const IDLE_MS = 20_000; // back to the worker list if nobody touches the screen

/** Shared tablet: tap your photo, enter PIN, tap the big button. */
export function KioskApp({ businessName, initialWorkers }: { businessName: string; initialWorkers: KioskWorker[] }) {
  const [workers, setWorkers] = useState(initialWorkers);
  const [step, setStep] = useState<Step>({ kind: "grid" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PunchError | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const backToGrid = useCallback(() => {
    setStep({ kind: "grid" });
    setError(null);
    setBusy(false);
  }, []);

  const refresh = useCallback(async () => {
    const res = await listKioskWorkers().catch(() => null);
    if (res?.ok) setWorkers(res.workers);
  }, []);

  // Keep the green "working" dots fresh, including punches from other devices.
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Idle timeout: never leave a worker's screen (with their PIN in memory) open.
  useEffect(() => {
    clearTimeout(idle.current);
    if (step.kind === "pin" || step.kind === "panel") idle.current = setTimeout(backToGrid, IDLE_MS);
    return () => clearTimeout(idle.current);
  }, [step, errorKey, backToGrid]);

  async function onPin(worker: KioskWorker, pin: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await kioskVerify(worker.id, pin);
      if (res.ok) setStep({ kind: "panel", worker, pin, summary: res });
      else {
        setError(res);
        setErrorKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPunch(worker: KioskWorker, pin: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await kioskPunch(worker.id, pin);
      if (res.ok) {
        setStep({ kind: "done", name: worker.name, action: res.action, at: res.at, totalMinutes: res.total_minutes });
        setWorkers((ws) => ws.map((w) => (w.id === worker.id ? { ...w, clocked_in: res.action === "clock_in" } : w)));
      } else setError(res);
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "done") {
    return <SuccessScreen {...step} onDone={backToGrid} />;
  }

  if (step.kind === "pin" || step.kind === "panel") {
    const { worker } = step;
    return (
      <div className="flex min-h-dvh flex-col p-4">
        <Button variant="ghost" size="xl" className="self-start" onClick={backToGrid}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
          {step.kind === "pin" ? (
            <>
              <WorkerAvatar name={worker.name} photoUrl={worker.photo_url} className="size-24 text-3xl" />
              <div className="text-center">
                <div className="text-3xl font-bold">{worker.name}</div>
                <div className="text-muted-foreground text-lg">Enter your PIN · अपना PIN डालें</div>
              </div>
              <PinPad busy={busy} errorKey={errorKey} onComplete={(pin) => onPin(worker, pin)} />
            </>
          ) : (
            <WorkerPanel summary={step.summary} busy={busy} onPunch={() => onPunch(worker, step.pin)} />
          )}
          {error && <ErrorBox error={error} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{businessName}</h1>
          <p className="text-muted-foreground">Tap your photo · अपनी फ़ोटो दबाएं</p>
        </div>
        <Clock />
      </header>

      {workers.length === 0 ? (
        <p className="text-muted-foreground m-auto text-center text-lg">No workers yet. The owner adds them.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {workers.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => setStep({ kind: "pin", worker: w })}
                className={cn(
                  "bg-card flex w-full flex-col items-center gap-2 rounded-2xl border-4 p-4 active:scale-95",
                  w.clocked_in ? "border-punch-in" : "border-transparent shadow-sm",
                )}
              >
                <WorkerAvatar name={w.name} photoUrl={w.photo_url} className="size-24 text-3xl" />
                <span className="line-clamp-2 text-center text-lg leading-tight font-semibold">{w.name}</span>
                <span
                  className={cn(
                    "rounded-full px-3 py-0.5 text-sm font-semibold",
                    w.clocked_in ? "bg-punch-in text-punch-in-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {w.clocked_in ? "Working" : "Not in"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="text-muted-foreground mt-auto pt-8 text-center text-sm">
        <Link href="/punch/login" className="inline-flex items-center gap-1 underline underline-offset-4">
          <Smartphone className="size-4" /> On your own phone? Log in once here
        </Link>
      </footer>
    </div>
  );
}

function ErrorBox({ error }: { error: PunchError }) {
  const msg = errorMessage(error);
  return (
    <div role="alert" className="bg-punch-out/10 text-punch-out w-full max-w-md rounded-2xl p-4 text-center">
      <div className="text-lg font-semibold">{msg.en}</div>
      <div>{msg.hi}</div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <div className="text-right">
      <div className="text-3xl font-bold tabular-nums">
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </div>
      <div className="text-muted-foreground text-sm">
        {now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
      </div>
    </div>
  );
}

export { ErrorBox };
