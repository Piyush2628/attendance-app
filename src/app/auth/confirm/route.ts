import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Target of the sign-up confirmation email. Works with both email templates:
 * - Supabase's default "Confirm signup" template: Supabase confirms the email,
 *   then sends the owner here with ?code=...
 * - The custom template from the README:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/admin
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get("next")?.startsWith("/admin") ? params.get("next")! : "/admin";
  const supabase = await createClient();

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    redirect(error ? "/login?error=link" : next);
  }

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // The email is already confirmed by now. Exchanging the code only fails when the
    // link is opened in a different browser from the one used to sign up.
    redirect(error ? "/login?confirmed=1" : next);
  }

  redirect("/login?error=link");
}
