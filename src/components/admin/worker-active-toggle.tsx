"use client";

import { useTransition } from "react";
import { UserCheck, UserX } from "lucide-react";

import { setWorkerActive } from "@/app/admin/workers/actions";
import { Button } from "@/components/ui/button";

export function WorkerActiveToggle({ workerId, active, name }: { workerId: string; active: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (active && !confirm(`Remove ${name} from the kiosk and today's list? Past attendance is kept.`)) return;
        startTransition(async () => {
          await setWorkerActive(workerId, !active);
        });
      }}
    >
      {active ? <UserX /> : <UserCheck />}
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
