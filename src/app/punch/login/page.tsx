import { redirect } from "next/navigation";

import { PhoneLogin } from "@/components/punch/phone-login";
import { createAnonClient } from "@/lib/supabase/anon";
import { getKioskCode } from "@/lib/worker-session";
import type { KioskWorkerList } from "@/types/database";

export const metadata = { title: "Log in on your phone" };

export default async function PhoneLoginPage() {
  const code = await getKioskCode();
  if (!code) redirect("/punch");
  const { data } = await createAnonClient().rpc("kiosk_list_workers", { p_kiosk_code: code });
  const list = data as KioskWorkerList | null;
  if (!list?.ok) redirect("/punch");
  return <PhoneLogin businessName={list.business_name} />;
}
