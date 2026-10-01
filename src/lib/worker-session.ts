import "server-only";

import { cookies } from "next/headers";

import { KIOSK_COOKIE, KIOSK_MAX_AGE, PUNCH_COOKIE_OPTIONS } from "@/lib/kiosk-cookie";

// Personal-mode worker session (token from the worker_login RPC).
// httpOnly so page scripts can never read it; 90 days matches the DB expiry.
const SESSION_COOKIE = "worker_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export async function getWorkerToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function setWorkerToken(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, { ...PUNCH_COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE });
}

export async function clearWorkerToken() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/punch" });
}

export async function getKioskCode() {
  return (await cookies()).get(KIOSK_COOKIE)?.value ?? null;
}

export async function setKioskCode(code: string) {
  (await cookies()).set(KIOSK_COOKIE, code, { ...PUNCH_COOKIE_OPTIONS, maxAge: KIOSK_MAX_AGE });
}

export async function clearKioskCode() {
  (await cookies()).delete({ name: KIOSK_COOKIE, path: "/punch" });
}
