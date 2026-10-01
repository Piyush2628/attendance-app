import type { PunchError } from "@/types/database";

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
  }
}
