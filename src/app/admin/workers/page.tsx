import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Workers" };

export default function WorkersPage() {
  return (
    <ComingSoon title="Workers" step={2}>
      Add and edit workers: name, phone, photo, wage type, rates, shift hours, OT rate and PIN
      (set_worker_pin RPC).
    </ComingSoon>
  );
}
