import Link from "next/link";
import { CalendarHeart, LogOut, Settings } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { BottomNav, TopNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/admin/data";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // proxy.ts already redirects; this is the authoritative check.
  const { settings } = await requireOwner();

  return (
    // The phone tab bar is the last item of this full-height column and sticks to the
    // bottom (not position: fixed). iOS home-screen apps drew the fixed bar too high
    // while a short page or the loading skeleton was showing.
    <div className="flex flex-1 flex-col">
      <header className="no-print border-b px-4 py-2">
        <nav className="mx-auto flex max-w-5xl items-center gap-6">
          <span className="min-w-0 truncate font-bold">{settings.business_name}</span>
          <TopNav />
          <div className="ml-auto flex shrink-0 items-center">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/holidays">
                <CalendarHeart /> <span className="hidden sm:inline">Holidays</span>
                <span className="sr-only sm:hidden">Holidays</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/settings">
                <Settings /> <span className="hidden sm:inline">Settings</span>
                <span className="sr-only sm:hidden">Settings</span>
              </Link>
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut /> <span className="hidden sm:inline">Sign out</span>
                <span className="sr-only sm:hidden">Sign out</span>
              </Button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 p-4">{children}</main>
      <BottomNav />
    </div>
  );
}
