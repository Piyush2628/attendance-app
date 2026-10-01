"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

import { saveBusinessCode, type CodeState } from "@/app/punch/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/use-form-action";

/** Shown when this device doesn't know which business it belongs to. */
export function BusinessCodeForm({ initialError }: { initialError?: string }) {
  const [state, onSubmit, pending] = useFormAction<CodeState>(saveBusinessCode, { error: initialError });
  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <Building2 className="text-muted-foreground size-14" />
      <h1 className="text-2xl font-bold">Enter business code</h1>
      <p className="text-muted-foreground">
        Ask the owner for the punch link, or type the code shown on their dashboard.
        <br />
        मालिक से कोड लें
      </p>
      <Input
        name="code"
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="e.g. 6434847DCE"
        className="h-14 text-center font-mono text-2xl tracking-widest uppercase"
        required
      />
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      <Link href="/login" className="text-muted-foreground text-sm underline underline-offset-4">
        Owner? Sign in to the dashboard
      </Link>
    </form>
  );
}
