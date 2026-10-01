import { formatDistance } from "@/lib/geo";
import type { PunchError } from "@/types/database";

/** A server action that threw (network down, server unreachable). */
export const OFFLINE_ERROR: PunchError = { ok: false, error: "offline" };

/** Short, plain messages. Hindi line underneath for workers who read Hindi better. */
export function errorMessage(err: PunchError): { en: string; hi: string } {
  switch (err.error) {
    case "wrong_pin":
      return {
        en: `Wrong PIN. ${err.attempts_left ?? 0} ${err.attempts_left === 1 ? "try" : "tries"} left.`,
        hi: "PIN गलत है",
      };
    case "locked": {
      const until = err.locked_until
        ? new Date(err.locked_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "later";
      return { en: `Too many wrong PINs. Try again after ${until}, or ask the owner.`, hi: "थोड़ी देर बाद कोशिश करें" };
    }
    case "no_pin":
      return { en: "No PIN set yet. Ask the owner.", hi: "मालिक से PIN लें" };
    case "already_done_today":
      return { en: "You already clocked out today. Ask the owner to fix it.", hi: "आज की हाज़िरी हो चुकी है" };
    case "not_found":
      return { en: "Not found. Check your phone number or ask the owner.", hi: "नंबर नहीं मिला" };
    case "invalid_session":
      return { en: "Please log in again.", hi: "फिर से लॉगिन करें" };
    case "invalid_code":
      return { en: "This device is not set up. Ask the owner for the link.", hi: "मालिक से लिंक लें" };
    case "outside_area":
      return {
        en: `You are ${err.distance_m != null ? formatDistance(err.distance_m) : "too far"} away from work. Punch from the workplace.`,
        hi: "आप काम की जगह से दूर हैं",
      };
    case "location_weak":
      return {
        en: "Your location is not clear. Turn on GPS, go near a window or outside, and try again.",
        hi: "लोकेशन साफ़ नहीं है, GPS चालू करके फिर कोशिश करें",
      };
    case "location_denied":
      return {
        en: "Location is blocked. Allow location for this site in the browser settings, then try again.",
        hi: "लोकेशन की इजाज़त दें, फिर कोशिश करें",
      };
    case "location_needed":
    case "location_unavailable":
      return { en: "Could not find your location. Turn on GPS and try again.", hi: "GPS चालू करके फिर कोशिश करें" };
    case "selfie_needed":
      return { en: "A selfie is needed to punch. Try again and look at the camera.", hi: "पंच के लिए फ़ोटो ज़रूरी है" };
    case "camera_denied":
      return {
        en: "Camera is blocked. Allow the camera for this site in the browser settings, then try again.",
        hi: "कैमरे की इजाज़त दें, फिर कोशिश करें",
      };
    case "camera_unavailable":
      return { en: "Could not open the camera. Close other apps using it and try again.", hi: "कैमरा नहीं खुला, फिर कोशिश करें" };
    case "offline":
      return { en: "No internet. Nothing was saved. Try again when it's back.", hi: "इंटरनेट नहीं है, फिर से कोशिश करें" };
  }
}
