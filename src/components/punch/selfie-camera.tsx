"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type SelfieResult = string | { error: "camera_denied" | "camera_unavailable" } | null;

const SIZE = 320; // px, square
const QUALITY = 0.6; // JPEG quality: ~15-25 KB per photo
const COUNTDOWN = 3; // seconds before the photo is taken automatically

/**
 * A full-screen front-camera view that takes one small square JPEG.
 * `takeSelfie()` opens it and resolves with a data URL, an error, or null if
 * the employee cancelled. Render `camera` somewhere in the tree.
 */
export function useSelfieCamera() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((r: SelfieResult) => void) | null>(null);

  const takeSelfie = useCallback(
    () =>
      new Promise<SelfieResult>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const finish = useCallback((r: SelfieResult) => {
    setOpen(false);
    resolver.current?.(r);
    resolver.current = null;
  }, []);

  return { takeSelfie, camera: open ? <SelfieCamera onDone={finish} /> : null, cameraOpen: open };
}

function SelfieCamera({ onDone }: { onDone: (r: SelfieResult) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(COUNTDOWN);
  const done = useRef(false);

  const finish = useCallback(
    (r: SelfieResult) => {
      if (done.current) return;
      done.current = true;
      onDone(r);
    },
    [onDone],
  );

  // Start the front camera; stop it when the view closes.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      finish({ error: "camera_unavailable" });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      .then((s) => {
        stream = s;
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: unknown) => {
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        finish({ error: denied ? "camera_denied" : "camera_unavailable" });
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [finish]);

  const capture = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return finish({ error: "camera_unavailable" });
    // Centre square crop, scaled down.
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    finish(canvas.toDataURL("image/jpeg", QUALITY));
  }, [finish]);

  // Count down once the picture is live, then take the photo.
  useEffect(() => {
    if (!ready) return;
    if (count === 0) {
      capture();
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [ready, count, capture]);

  return (
    <div
      className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-4"
      data-testid="selfie-camera"
    >
      <div className="text-center">
        <div className="text-2xl font-bold">Look at the camera</div>
        <div className="text-muted-foreground text-lg">कैमरे की तरफ देखें</div>
      </div>
      <div className="bg-muted relative aspect-square w-full max-w-xs overflow-hidden rounded-full border-4">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          onPlaying={() => setReady(true)}
          // Mirrored like a mirror; the saved photo is not.
          className="size-full -scale-x-100 object-cover"
        />
        {ready && count > 0 && (
          <div className="absolute inset-0 grid place-items-center text-7xl font-bold text-white drop-shadow-lg">
            {count}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="xl" onClick={() => finish(null)}>
          <X /> Cancel
        </Button>
        <Button size="xl" onClick={capture} disabled={!ready}>
          <Camera /> Take photo
        </Button>
      </div>
    </div>
  );
}
