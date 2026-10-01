"use client";

import { useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { promptInstall, useInstallPrompt, useIsInstalled, useIsIos } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/**
 * "Install app" on Android / desktop Chrome, step-by-step help on iPhone / iPad.
 * Renders nothing once the app is installed or when the browser can't install.
 */
export function InstallButton({ className }: { className?: string }) {
  const prompt = useInstallPrompt();
  const installed = useIsInstalled();
  const ios = useIsIos();
  const [iosHelp, setIosHelp] = useState(false);

  if (installed) return null;

  if (prompt) {
    return (
      <Button type="button" variant="outline" size="lg" className={className} onClick={() => promptInstall()}>
        <Download /> Install app · ऐप इंस्टॉल करें
      </Button>
    );
  }

  if (ios) {
    return (
      <div className={cn("grid justify-items-center gap-2", className)}>
        <Button type="button" variant="outline" size="lg" onClick={() => setIosHelp((v) => !v)} aria-expanded={iosHelp}>
          <SquarePlus /> Add to Home Screen
        </Button>
        {iosHelp && (
          <ol className="bg-muted text-foreground grid gap-1 rounded-xl p-3 text-left text-sm">
            <li>
              1. Tap <Share className="inline size-4 align-text-bottom" /> <b>Share</b> at the bottom of Safari.
            </li>
            <li>
              2. Tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
            <li>3. Open it from the new icon on your home screen.</li>
          </ol>
        )}
      </div>
    );
  }

  return null;
}
