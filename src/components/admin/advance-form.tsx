"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { addAdvance, type AdvanceState } from "@/app/admin/khata/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useFormAction } from "@/lib/use-form-action";

export function AdvanceForm({ workers, today }: { workers: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useFormAction<AdvanceState>(addAdvance, {});
  const form = useRef<HTMLFormElement>(null);
  const amount = useRef<HTMLInputElement>(null);

  // After saving, clear amount + notes but keep worker and date for quick repeat entries.
  useEffect(() => {
    if (!state.ok || !form.current) return;
    (form.current.elements.namedItem("amount") as HTMLInputElement).value = "";
    (form.current.elements.namedItem("notes") as HTMLInputElement).value = "";
    amount.current?.focus();
  }, [state.ok, state.savedAt]);

  return (
    <form ref={form} onSubmit={action} className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="grid gap-1.5">
        <Label htmlFor="worker_id">Worker</Label>
        <NativeSelect id="worker_id" name="worker_id" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">Amount (₹)</Label>
        <Input ref={amount} id="amount" name="amount" type="number" inputMode="decimal" min="1" step="any" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={today} max={today} required />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Note (optional)</Label>
        <Input id="notes" name="notes" placeholder="Cash for medicine" />
      </div>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={pending}>
          <Plus /> {pending ? "Saving…" : "Add advance"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {state.error}
        </p>
      )}
      {state.ok && !pending && <p className="text-sm text-emerald-700 sm:col-span-3">Advance saved.</p>}
    </form>
  );
}
