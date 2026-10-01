import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Clock In / Out" };

export default function PunchPage() {
  return (
    <main className="flex flex-1 items-center p-6">
      <ComingSoon title="Punch screen" step={3}>
        Kiosk mode (/punch?k=CODE: worker cards, PIN keypad, giant green/red button) and personal
        phone mode (business code + phone + PIN, remembered in an httpOnly cookie).
      </ComingSoon>
    </main>
  );
}
