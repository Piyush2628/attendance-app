import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenText, IndianRupee, LayoutDashboard, Users } from "lucide-react";

import { getAdminId } from "@/lib/supabase/server";

const nav = [
  { href: "/admin", label: "Today", icon: LayoutDashboard },
  { href: "/admin/workers", label: "Workers", icon: Users },
  { href: "/admin/khata", label: "Khata", icon: BookOpenText },
  { href: "/admin/payroll", label: "Payroll", icon: IndianRupee },
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // proxy.ts already redirects; this is the authoritative check.
  if (!(await getAdminId())) redirect("/login?next=/admin");

  return (
    <div className="flex flex-1 flex-col pb-20 md:pb-0">
      <header className="no-print border-b px-4 py-3">
        <nav className="mx-auto flex max-w-5xl items-center gap-6">
          <span className="font-bold">Attendance</span>
          <div className="hidden gap-4 md:flex">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground text-sm">
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
      {/* Mobile bottom tab bar */}
      <nav className="no-print bg-background fixed inset-x-0 bottom-0 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2 text-xs">
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
