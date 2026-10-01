import { redirect } from "next/navigation";

import { getAdminId } from "@/lib/supabase/server";

import { AuthForm } from "./auth-form";

export const metadata = { title: "Owner login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, confirmed, error } = await searchParams;
  if (await getAdminId()) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <AuthForm
        next={typeof next === "string" ? next : undefined}
        notice={
          confirmed
            ? { tone: "ok", text: "Email confirmed. Sign in below." }
            : error === "link"
              ? { tone: "error", text: "That link has expired or was already used. Try signing in." }
              : undefined
        }
      />
    </main>
  );
}
