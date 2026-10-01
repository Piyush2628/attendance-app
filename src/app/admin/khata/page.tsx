import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Khata" };

export default function KhataPage() {
  return (
    <ComingSoon title="Khata / advances" step={2}>
      Record cash advances (udhari) given to workers.
    </ComingSoon>
  );
}
