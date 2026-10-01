"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MonitorSmartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shows the kiosk / worker link for this business with a copy button. */
export function PunchLinkCard({ kioskCode }: { kioskCode: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // window is only available after hydration
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/punch?k=${kioskCode}`;

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center">
      <MonitorSmartphone className="text-muted-foreground hidden size-5 sm:block" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Punch link for the kiosk tablet and employees&apos; phones</div>
        <div className="text-muted-foreground truncate font-mono text-xs">{url}</div>
        <div className="text-muted-foreground text-xs">
          Business code: <span className="font-mono font-semibold">{kioskCode}</span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
