"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { workerLogout, workerPunch, workerStatus } from "@/app/punch/actions";
import { ErrorBox } from "@/components/punch/kiosk-app";
import { OFFLINE_ERROR } from "@/components/punch/messages";
import { SuccessScreen } from "@/components/punch/success-screen";
import { WorkerPanel } from "@/components/punch/worker-panel";
import { InstallButton } from "@/components/pwa/install-button";
import { Button } from "@/components/ui/button";
import type { PunchError, PunchResult, WorkerSummary } from "@/types/database";

/** Worker's own phone, already logged in: just the big button and their history. */
export function PersonalApp({ initialSummary }: { initialSummary: WorkerSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PunchError | null>(null);
  const [done, setDone] = useState<Extract<PunchResult, { ok: true }> | null>(null);

  async function punch() {
    setBusy(true);
    setError(null);
    try {
      const res = await workerPunch();
      if (res.ok) {
        setDone(res);
        setSummary(res.summary);
      } else setError(res);
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function afterSuccess() {
    setDone(null);
    const fresh = await workerStatus().catch(() => null);
    if (fresh?.ok) setSummary(fresh);
  }

  if (done) {
    return (
      <SuccessScreen
        action={done.action}
        at={done.at}
        name={summary.worker.name}
        totalMinutes={done.total_minutes}
        onDone={afterSuccess}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <WorkerPanel
        summary={summary}
        busy={busy}
        onPunch={punch}
        footer={
          <>
            {error && <ErrorBox error={error} />}
            <InstallButton className="mt-4" />
            <form action={workerLogout} className="mt-4">
              <Button variant="ghost" type="submit" className="text-muted-foreground">
                <LogOut /> Log out of this phone
              </Button>
            </form>
          </>
        }
      />
    </div>
  );
}
