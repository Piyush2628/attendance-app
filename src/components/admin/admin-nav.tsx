"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, IndianRupee, LayoutDashboard, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Today", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/admin/payroll", label: "Payroll", icon: IndianRupee },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
}

/** Text links in the header on tablets and computers. */
export function TopNav() {
  const isActive = useActive();
  return (
    <div className="hidden gap-4 md:flex">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "text-sm",
            isActive(href) ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

/** Big tab bar at the bottom of the screen on phones. */
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav className="no-print bg-background fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-1 py-2 text-xs",
            isActive(href) ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          <Icon className={cn("size-6", isActive(href) && "stroke-[2.5]")} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
