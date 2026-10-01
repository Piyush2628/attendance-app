import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only admin pages and the login page need the Supabase session.
  // /punch is cookie-free for Supabase Auth (workers use PIN sessions).
  matcher: ["/admin/:path*", "/login"],
};
