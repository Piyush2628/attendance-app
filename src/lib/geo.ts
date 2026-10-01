import type { GeoFix } from "@/types/database";

export type GeoError = "location_denied" | "location_unavailable";

/**
 * One fresh GPS fix from the browser. Asks for permission the first time.
 * Resolves (never rejects) so callers can show a plain message.
 */
export function getLocation(timeoutMs = 15_000): Promise<GeoFix | { error: GeoError }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ error: "location_unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => resolve({ error: err.code === err.PERMISSION_DENIED ? "location_denied" : "location_unavailable" }),
      // Always a fresh fix: a cached one could be from before they walked in.
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** Ask for location permission early (kiosk start), so the first punch isn't slowed by the prompt. */
export function warmUpLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    () => {},
    () => {},
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
  );
}

/** "450 m" or "2.3 km". */
export function formatDistance(metres: number) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** Google Maps link for a point (opens the app on phones). */
export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Parses "28.6139, 77.2090" (as copied from Google Maps). */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
