import { Badge } from "@/components/ui/badge";
import type { SelfieIds } from "@/lib/admin/data";
import { formatMinutes } from "@/lib/format";
import { LATE_GRACE_MINUTES } from "@/lib/timing";

/** "Late 25m" when the employee clocked in more than the grace period after their start time. */
export function LateTag({ minutes }: { minutes: number | null | undefined }) {
  if (minutes == null || minutes <= LATE_GRACE_MINUTES) return null;
  const label = minutes < 60 ? `${minutes}m` : formatMinutes(minutes);
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700" data-testid="late-tag">
      Late {label}
    </Badge>
  );
}

/** Small round clock-in / clock-out selfies; tap to open the photo. */
export function SelfieThumbs({ selfies, name }: { selfies: SelfieIds; name: string }) {
  const shots = (["in", "out"] as const).filter((k) => selfies[k]);
  if (shots.length === 0) return null;
  return (
    <div className="flex shrink-0 gap-1" data-testid="selfies">
      {shots.map((k) => (
        <a
          key={k}
          href={`/admin/selfie/${selfies[k]}`}
          target="_blank"
          rel="noreferrer"
          className="relative block"
          title={`${name}: clock-${k} photo`}
        >
          {/* Served by our own route as a ~20 KB JPEG; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/admin/selfie/${selfies[k]}`}
            alt={`${name} at clock-${k}`}
            loading="lazy"
            className="size-10 rounded-full border object-cover"
          />
          <span className="bg-background absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1 text-[9px] leading-tight font-bold uppercase">
            {k}
          </span>
        </a>
      ))}
    </div>
  );
}
