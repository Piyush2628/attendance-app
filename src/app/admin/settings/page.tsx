import Link from "next/link";
import { CalendarHeart, ChevronRight } from "lucide-react";

import { PunchLinkCard } from "@/components/admin/punch-link-card";
import { SelfieCard } from "@/components/admin/selfie-card";
import { WorkLocationCard } from "@/components/admin/work-location-card";
import { WorkTimingsCard } from "@/components/admin/work-timings-card";
import { loadHolidays, requireOwner } from "@/lib/admin/data";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, settings, today } = await requireOwner();
  const year = today.slice(0, 4);
  const holidays = [...(await loadHolidays(supabase, `${year}-01-01`, `${year}-12-31`)).values()];
  const next = holidays.find((h) => h.date >= today);
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <PunchLinkCard kioskCode={settings.kiosk_code} />
      <WorkTimingsCard settings={settings} />
      <Link
        href="/admin/holidays"
        className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-4"
        data-testid="holidays-link"
      >
        <CalendarHeart className="text-muted-foreground size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Holidays</div>
          <p className="text-muted-foreground text-sm">
            {holidays.length === 0
              ? `None set for ${year}. Add festivals so nobody is marked absent on them.`
              : `${holidays.length} in ${year}${next ? ` · next: ${next.name}` : ""}`}
          </p>
        </div>
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      </Link>
      <WorkLocationCard settings={settings} />
      <SelfieCard selfieRequired={settings.selfie_required} />
    </div>
  );
}
