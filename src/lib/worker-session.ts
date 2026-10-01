import "server-only";

import { cookies } from "next/headers";

// Personal-mode worker session (token from the worker_login RPC).
// httpOnly so page scripts can never read it; 90 days matches the DB expiry.
const COOKIE = "worker_session";
const MAX_AGE = 60 * 60 * 24 * 90;

export async function getWorkerToken() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function setWorkerToken(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/punch",
    maxAge: MAX_AGE,
  });
}

export async function clearWorkerToken() {
  (await cookies()).delete({ name: COOKIE, path: "/punch" });
}
