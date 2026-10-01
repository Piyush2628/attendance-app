import Link from "next/link";
import { Fingerprint, LayoutDashboard } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground mt-2">Attendance and salary, made simple.</p>
      </div>
      <Button asChild variant="punchIn" size="xl" className="h-24 text-2xl">
        <Link href="/punch">
          <Fingerprint className="size-8" />
          Clock In / Out
        </Link>
      </Button>
      <Button asChild variant="outline" size="xl">
        <Link href="/admin">
          <LayoutDashboard />
          Owner login
        </Link>
      </Button>
    </main>
  );
}
