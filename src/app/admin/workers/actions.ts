"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/admin/data";
import type { WageType } from "@/types/database";

export type SaveWorkerState = { ok?: boolean; error?: string; savedAt?: number };

const WAGE_TYPES: WageType[] = ["daily", "hourly", "monthly"];

function num(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export async function saveWorker(_prev: SaveWorkerState, formData: FormData): Promise<SaveWorkerState> {
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").replace(/[^0-9+]/g, "") || null;
  const photoUrl = String(formData.get("photo_url") ?? "") || null;
  const pin = String(formData.get("pin") ?? "").trim();
  const wageType = String(formData.get("wage_type") ?? "") as WageType;

  const values = {
    name,
    phone,
    photo_url: photoUrl,
    wage_type: wageType,
    daily_rate: num(formData, "daily_rate"),
    hourly_rate: num(formData, "hourly_rate"),
    monthly_salary: num(formData, "monthly_salary"),
    standard_shift_hours: num(formData, "standard_shift_hours"),
    ot_rate_per_hour: num(formData, "ot_rate_per_hour"),
  };

  if (!name) return { error: "Enter the worker's name." };
  if (phone && !/^[0-9+]{6,15}$/.test(phone)) return { error: "Phone number looks wrong." };
  if (!WAGE_TYPES.includes(wageType)) return { error: "Choose daily, hourly or monthly." };
  for (const [key, v] of Object.entries(values)) {
    if (typeof v === "number" && (Number.isNaN(v) || v < 0)) return { error: `Check the ${key.replaceAll("_", " ")}.` };
  }
  const rateKey = { daily: "daily_rate", hourly: "hourly_rate", monthly: "monthly_salary" } as const;
  if (values[rateKey[wageType]] <= 0) return { error: "Enter the wage amount." };
  if (values.standard_shift_hours <= 0 || values.standard_shift_hours > 24) {
    return { error: "Shift hours must be between 1 and 24." };
  }
  if (!id && !pin) return { error: "Set a 4-digit PIN for the worker." };
  if (pin && !/^[0-9]{4}$/.test(pin)) return { error: "PIN must be exactly 4 digits." };

  const { supabase } = await requireOwner();

  let workerId = id;
  if (id) {
    const { error } = await supabase.from("workers").update(values).eq("id", id);
    if (error) return { error: friendly(error) };
  } else {
    const { data, error } = await supabase.from("workers").insert(values).select("id").single();
    if (error) return { error: friendly(error) };
    workerId = data.id;
  }

  if (pin && workerId) {
    const { error } = await supabase.rpc("set_worker_pin", { p_worker_id: workerId, p_pin: pin });
    if (error) return { error: `Saved, but the PIN was not set: ${error.message}` };
  }

  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: Date.now() };
}

export async function setWorkerActive(workerId: string, active: boolean) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("workers").update({ is_active: active }).eq("id", workerId);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return {};
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Another worker already has this phone number.";
  return error.message;
}
