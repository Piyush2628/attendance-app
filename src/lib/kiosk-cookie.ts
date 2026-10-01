// Business code remembered by this device (kiosk tablet or a worker's phone).
// Set by proxy.ts when /punch?k=CODE is opened. It only says which business's
// workers to list; every punch still needs a PIN or a worker session.
// No "server-only" here: proxy.ts imports it too.
export const KIOSK_COOKIE = "kiosk_code";
export const KIOSK_MAX_AGE = 60 * 60 * 24 * 365;

export const PUNCH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/punch",
};

export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}
