import { CalendarHeart } from "lucide-react";

import { HOLIDAY_STYLE } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import type { TodayHoliday } from "@/types/database";

/** "Today is a holiday: Diwali" on the punch screens. Punching still works. */
export function HolidayBanner({ holiday, className }: { holiday: TodayHoliday | null | undefined; className?: string }) {
  if (!holiday) return null;
  return (
    <div
      className={cn("flex items-center gap-3 rounded-2xl p-3", HOLIDAY_STYLE.soft, className)}
      data-testid="holiday-banner"
    >
      <CalendarHeart className="size-6 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">Today is a holiday: {holiday.name}</div>
        <div className="text-sm opacity-80">आज छुट्टी है</div>
      </div>
    </div>
  );
}
