import { BusinessCodeForm } from "@/components/punch/business-code-form";
import { KioskApp } from "@/components/punch/kiosk-app";
import { PersonalApp } from "@/components/punch/personal-app";
import { createAnonClient } from "@/lib/supabase/anon";
import { getKioskCode, getWorkerToken } from "@/lib/worker-session";
import type { KioskWorkerList, WorkerSummary } from "@/types/database";

export const metadata = { title: "Clock In / Out" };

export default async function PunchPage() {
  const supabase = createAnonClient();

  // 1. A worker's own phone that is logged in: their personal screen.
  const token = await getWorkerToken();
  if (token) {
    const { data } = await supabase.rpc("worker_status", { p_token: token });
    const status = data as WorkerSummary | { ok: false } | null;
    if (status?.ok) return <PersonalApp initialSummary={status} />;
    // Expired or revoked (e.g. PIN changed): fall through to the kiosk / code screen.
  }

  // 2. A device that knows its business: the shared kiosk grid.
  const code = await getKioskCode();
  if (code) {
    const { data } = await supabase.rpc("kiosk_list_workers", { p_kiosk_code: code });
    const list = data as KioskWorkerList | null;
    if (list?.ok)
      return (
        <KioskApp businessName={list.business_name} initialWorkers={list.workers} gpsRequired={list.gps_required} />
      );
    return (
      <Centered>
        <BusinessCodeForm initialError="This device's business code no longer works. Enter the new one." />
      </Centered>
    );
  }

  // 3. Brand-new device.
  return (
    <Centered>
      <BusinessCodeForm />
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6">{children}</main>;
}
