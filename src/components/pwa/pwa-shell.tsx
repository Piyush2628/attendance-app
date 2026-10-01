"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";

import { useOnline } from "@/lib/pwa";

/** Registers the service worker and shows a banner whenever the device is offline. */
export function PwaShell() {
  const online = useOnline();

  useEffect(() => {
    // Dev builds change on every save; a service worker would only get in the way.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      className="no-print bg-punch-out text-punch-out-foreground sticky top-0 z-50 flex items-center justify-center gap-2 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-semibold"
    >
      <WifiOff className="size-4 shrink-0" />
      No internet. Punches won&apos;t save until it&apos;s back. · इंटरनेट नहीं है
    </div>
  );
}
