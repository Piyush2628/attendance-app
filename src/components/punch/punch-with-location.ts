import { getLocation } from "@/lib/geo";
import type { GeoFix, PunchResult } from "@/types/database";

/**
 * Runs a punch, first getting a GPS fix when the owner's GPS check is on.
 * If the screen didn't know the check was on (the owner turned it on after
 * the page loaded), the server answers location_needed and we retry once
 * with a location.
 */
export async function punchWithLocation(
  needsLocation: boolean,
  punch: (fix: GeoFix | null) => Promise<PunchResult>,
  onLocating: () => void,
  onSaving: () => void,
): Promise<PunchResult> {
  let fix: GeoFix | null = null;
  if (needsLocation) {
    onLocating();
    const loc = await getLocation();
    if ("error" in loc) return { ok: false, error: loc.error };
    fix = loc;
  }
  onSaving();
  const res = await punch(fix);
  if (!res.ok && res.error === "location_needed" && !fix) {
    return punchWithLocation(true, punch, onLocating, onSaving);
  }
  return res;
}
