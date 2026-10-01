import type { SelfieResult } from "@/components/punch/selfie-camera";
import { getLocation, type GeoError } from "@/lib/geo";
import type { GeoFix, PunchResult } from "@/types/database";

export type PunchExtras = { fix: GeoFix | null; selfie: string | null };

/**
 * Runs a punch, first taking a selfie and/or getting a GPS fix when the owner
 * turned those checks on. The location is looked up while the camera is open.
 * If the screen didn't know a check was on (the owner turned it on after the
 * page loaded), the server answers location_needed / selfie_needed and we
 * retry with it. Resolves null when the employee cancelled the camera.
 */
export async function punchWithChecks(opts: {
  needsLocation: boolean;
  needsSelfie: boolean;
  takeSelfie: () => Promise<SelfieResult>;
  punch: (extras: PunchExtras) => Promise<PunchResult>;
  onLocating: () => void;
  onSaving: () => void;
}): Promise<PunchResult | null> {
  let { needsLocation, needsSelfie } = opts;
  let fix: GeoFix | null = null;
  let selfie: string | null = null;

  // At most one retry per check.
  for (;;) {
    const location: Promise<GeoFix | { error: GeoError }> | null = needsLocation && !fix ? getLocation() : null;

    if (needsSelfie && !selfie) {
      const shot = await opts.takeSelfie();
      if (shot === null) return null;
      if (typeof shot !== "string") return { ok: false, error: shot.error };
      selfie = shot;
    }

    if (location) {
      opts.onLocating();
      const loc: GeoFix | { error: GeoError } = await location;
      if ("error" in loc) return { ok: false, error: loc.error };
      fix = loc;
    }

    opts.onSaving();
    const res = await opts.punch({ fix, selfie });
    if (!res.ok && res.error === "location_needed" && !fix) needsLocation = true;
    else if (!res.ok && res.error === "selfie_needed" && !selfie) needsSelfie = true;
    else return res;
  }
}
