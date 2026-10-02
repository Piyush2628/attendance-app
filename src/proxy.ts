import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { KIOSK_COOKIE, KIOSK_MAX_AGE, normalizeCode, PUNCH_COOKIE_OPTIONS } from "@/lib/kiosk-cookie";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/punch" || pathname.startsWith("/punch/")) {
    // /punch?k=CODE (the owner's shared link): remember the business on this
    // device, then drop the code from the URL so a home-screen install works.
    const code = searchParams.get("k");
    if (!code) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.searchParams.delete("k");
    const response = NextResponse.redirect(url);
    response.cookies.set(KIOSK_COOKIE, normalizeCode(code), { ...PUNCH_COOKIE_OPTIONS, maxAge: KIOSK_MAX_AGE });
    return response;
  }

  return updateSession(request);
}

export const config = {
  // Admin pages and login need the Supabase session; /punch only needs the
  // business-code cookie (workers use PIN sessions, not Supabase Auth).
  matcher: ["/start", "/admin/:path*", "/login", "/auth/:path*", "/punch", "/punch/:path*"],
};
