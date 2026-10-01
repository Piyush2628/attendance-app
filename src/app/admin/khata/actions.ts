"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/admin/data";

export type AdvanceState = { ok?: boolean; error?: string; savedAt?: number };

export async function addAdvance(_prev: AdvanceState, formData: FormData): Promise<AdvanceState> {
  const workerId = String(formData.get("worker_id") ?? "");
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!workerId) return { error: "Choose a worker." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount above 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };

  const { supabase } = await requireOwner();
  const { error } = await supabase.from("advances").insert({ worker_id: workerId, amount, date, notes });
  if (error) return { error: error.message };

  revalidatePath("/admin/khata");
  return { ok: true, savedAt: Date.now() };
}

export async function deleteAdvance(id: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("advances").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/khata");
  return {};
}
