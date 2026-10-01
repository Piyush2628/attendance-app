"use client";

import { Camera } from "lucide-react";

import { saveSelfieRequired, type SettingsState } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/lib/use-form-action";

/** Turn the selfie-at-punch requirement on or off. */
export function SelfieCard({ selfieRequired }: { selfieRequired: boolean }) {
  const [state, action, pending] = useFormAction<SettingsState>(saveSelfieRequired, {});

  return (
    <form onSubmit={action} className="bg-card grid gap-4 rounded-xl border p-4" data-testid="selfie-setting">
      <div className="flex items-start gap-3">
        <Camera className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold">
            Selfie at punch
            <Badge variant={selfieRequired ? "present" : "outline"}>{selfieRequired ? "On" : "Off"}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            When on, the punch screen takes a small photo of the employee at every clock in and out, so you can see
            who punched. Photos are kept small (about 20 KB) and deleted after 45 days.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="selfie_required"
            defaultChecked={selfieRequired}
            className="accent-primary size-5"
          />
          Take a selfie when employees punch
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && !pending && <p className="text-sm text-emerald-700">Selfie setting saved.</p>}
    </form>
  );
}
