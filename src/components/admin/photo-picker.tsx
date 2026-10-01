"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "@/components/worker-avatar";
import { createClient } from "@/lib/supabase/client";

const SIZE = 400; // px, square. Small enough for slow kiosk connections.

/** Crop to a centred square and shrink to SIZE×SIZE JPEG. Phone photos are often 5+ MB. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read photo"))), "image/jpeg", 0.85),
  );
}

/**
 * Uploads straight from the browser to the worker-photos bucket
 * (folder = owner id, enforced by storage policies) and puts the public URL
 * in a hidden `photo_url` input for the surrounding form.
 */
export function PhotoPicker({
  ownerId,
  name,
  defaultUrl,
}: {
  ownerId: string;
  name: string;
  defaultUrl?: string | null;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await toSquareJpeg(file);
      const supabase = createClient();
      const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("worker-photos")
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      setUrl(supabase.storage.from("worker-photos").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name="photo_url" value={url} />
      <WorkerAvatar name={name || "?"} photoUrl={url || null} className="size-20 text-2xl" />
      <div className="grid gap-1">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            {url ? "Change photo" : "Add photo"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")} aria-label="Remove photo">
              <Trash2 />
            </Button>
          )}
        </div>
        {error && <span className="text-destructive text-xs">{error}</span>}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
