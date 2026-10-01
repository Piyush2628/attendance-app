"use server";

import { redirect } from "next/navigation";

import { normalizeCode } from "@/lib/kiosk-cookie";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  clearKioskCode,
  clearWorkerToken,
  getKioskCode,
  getWorkerToken,
  setKioskCode,
  setWorkerToken,
} from "@/lib/worker-session";
import type { GeoFix, KioskWorkerList, LoginResult, PunchError, PunchResult, WorkerSummary } from "@/types/database";

const noCode: PunchError = { ok: false, error: "invalid_code" };
const noSession: PunchError = { ok: false, error: "invalid_session" };

async function rpc<T>(fn: Parameters<ReturnType<typeof createAnonClient>["rpc"]>[0], args: object): Promise<T> {
  const { data, error } = await createAnonClient().rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Location args for the punch RPCs; the database ignores anything that isn't a real coordinate. */
function locationArgs(fix: GeoFix | null | undefined) {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { p_lat: num(fix?.lat), p_lng: num(fix?.lng), p_accuracy: num(fix?.accuracy) };
}

// ---- Kiosk (shared tablet) ---------------------------------------------------

export async function listKioskWorkers(): Promise<KioskWorkerList> {
  const code = await getKioskCode();
  if (!code) return noCode;
  return rpc<KioskWorkerList>("kiosk_list_workers", { p_kiosk_code: code });
}

export async function kioskVerify(workerId: string, pin: string): Promise<WorkerSummary | PunchError> {
  const code = await getKioskCode();
  if (!code) return noCode;
  return rpc("kiosk_verify_pin", { p_kiosk_code: code, p_worker_id: workerId, p_pin: pin });
}

export async function kioskPunch(workerId: string, pin: string, fix?: GeoFix | null): Promise<PunchResult> {
  const code = await getKioskCode();
  if (!code) return noCode;
  return rpc("kiosk_punch", { p_kiosk_code: code, p_worker_id: workerId, p_pin: pin, ...locationArgs(fix) });
}

// ---- Business code -----------------------------------------------------------

export type CodeState = { error?: string };

export async function saveBusinessCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter the code from your owner." };
  const list = await rpc<KioskWorkerList>("kiosk_list_workers", { p_kiosk_code: code });
  if (!list.ok) return { error: "That code is not right. Check with your owner." };
  await setKioskCode(code);
  redirect("/punch");
}

export async function forgetBusiness() {
  const token = await getWorkerToken();
  if (token) await rpc("worker_logout", { p_token: token });
  await clearWorkerToken();
  await clearKioskCode();
  redirect("/punch");
}

// ---- Personal phone ----------------------------------------------------------

export async function workerLogin(phone: string, pin: string): Promise<LoginResult> {
  const code = await getKioskCode();
  if (!code) return noCode;
  const result = await rpc<LoginResult>("worker_login", { p_kiosk_code: code, p_phone: phone, p_pin: pin });
  if (result.ok) await setWorkerToken(result.token);
  // Never send the token to the browser; the httpOnly cookie carries it.
  return result.ok ? { ...result, token: "" } : result;
}

export async function workerPunch(fix?: GeoFix | null): Promise<PunchResult> {
  const token = await getWorkerToken();
  if (!token) return noSession;
  return rpc("worker_punch", { p_token: token, ...locationArgs(fix) });
}

export async function workerStatus(): Promise<WorkerSummary | PunchError> {
  const token = await getWorkerToken();
  if (!token) return noSession;
  return rpc("worker_status", { p_token: token });
}

export async function workerLogout() {
  const token = await getWorkerToken();
  if (token) await rpc("worker_logout", { p_token: token });
  await clearWorkerToken();
  redirect("/punch");
}
