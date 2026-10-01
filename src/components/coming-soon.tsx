import { Construction } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Placeholder for screens built in later steps. Delete once each page is real. */
export function ComingSoon({ title, step, children }: { title: string; step: number; children?: React.ReactNode }) {
  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Construction className="size-5 text-amber-500" />
          {title}
        </CardTitle>
        <CardDescription>Built in step {step}.</CardDescription>
      </CardHeader>
      {children ? <CardContent className="text-muted-foreground text-sm">{children}</CardContent> : null}
    </Card>
  );
}
