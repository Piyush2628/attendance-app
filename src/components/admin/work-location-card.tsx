"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin } from "lucide-react";

import { saveWorkLocation, type WorkLocationState } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDistance, getLocation, mapsUrl, parseCoordinates } from "@/lib/geo";
import { useFormAction } from "@/lib/use-form-action";
import type { OwnerSettings } from "@/types/database";

const RADIUS_CHOICES = [50, 100, 200, 500, 1000];

/** Owner sets the workplace spot and turns on the GPS check for punches. */
export function WorkLocationCard({
  settings,
}: {
  settings: Pick<OwnerSettings, "work_lat" | "work_lng" | "work_radius_m" | "gps_required">;
}) {
  const [state, action, pending] = useFormAction<WorkLocationState>(saveWorkLocation, {});
  const [coords, setCoords] = useState(
    settings.work_lat != null && settings.work_lng != null ? `${settings.work_lat}, ${settings.work_lng}` : "",
  );
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const parsed = parseCoordinates(coords);
  const radii = RADIUS_CHOICES.includes(settings.work_radius_m)
    ? RADIUS_CHOICES
    : [...RADIUS_CHOICES, settings.work_radius_m].sort((a, b) => a - b);

  async function useCurrentLocation() {
    setLocating(true);
    setHint(null);
    const fix = await getLocation(20_000);
    setLocating(false);
    if ("error" in fix) {
      setHint(
        fix.error === "location_denied"
          ? "Location is blocked for this site. Allow it in the browser settings and try again."
          : "Could not find your location. Turn on GPS and try again.",
      );
      return;
    }
    setCoords(`${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}`);
    setHint(`Found, accurate to about ${formatDistance(fix.accuracy)}. Tap Save to keep it.`);
  }

  return (
    <form onSubmit={action} className="bg-card grid gap-4 rounded-xl border p-4" data-testid="work-location">
      <div className="flex items-start gap-3">
        <MapPin className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold">
            Location check
            <Badge variant={settings.gps_required ? "present" : "outline"}>
              {settings.gps_required ? "On" : "Off"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            When on, employees can clock in or out only near your workplace. Stand at the workplace and tap “Use my
            current location”.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="coords">Workplace location</Label>
          <div className="flex gap-2">
            <Input
              id="coords"
              name="coords"
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
              placeholder="28.6139, 77.2090"
              inputMode="decimal"
              autoComplete="off"
            />
            <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
              <span className="hidden sm:inline">Use my current location</span>
              <span className="sm:hidden">Use mine</span>
            </Button>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
            {hint && <span>{hint}</span>}
            {parsed && (
              <a href={mapsUrl(parsed.lat, parsed.lng)} target="_blank" rel="noreferrer" className="underline">
                Check on map
              </a>
            )}
          </div>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="radius">Allowed distance</Label>
          <NativeSelect id="radius" name="radius" defaultValue={settings.work_radius_m}>
            {radii.map((r) => (
              <option key={r} value={r}>
                Within {formatDistance(r)}
                {r === 200 ? " (recommended)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="gps_required"
            defaultChecked={settings.gps_required}
            className="accent-primary size-5"
          />
          Check location when employees punch
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && !pending && <p className="text-sm text-emerald-700">Location check saved.</p>}
    </form>
  );
}
