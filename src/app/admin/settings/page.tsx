import { PunchLinkCard } from "@/components/admin/punch-link-card";
import { WorkLocationCard } from "@/components/admin/work-location-card";
import { requireOwner } from "@/lib/admin/data";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { settings } = await requireOwner();
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <PunchLinkCard kioskCode={settings.kiosk_code} />
      <WorkLocationCard settings={settings} />
    </div>
  );
}
