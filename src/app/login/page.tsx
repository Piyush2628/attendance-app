import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Owner login" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center p-6">
      <ComingSoon title="Owner login" step={2}>
        Email and password sign-in with Supabase Auth.
      </ComingSoon>
    </main>
  );
}
