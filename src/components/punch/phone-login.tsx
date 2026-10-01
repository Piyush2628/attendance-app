"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";

import { workerLogin } from "@/app/punch/actions";
import { ErrorBox } from "@/components/punch/kiosk-app";
import { OFFLINE_ERROR } from "@/components/punch/messages";
import { PinPad } from "@/components/punch/pin-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PunchError } from "@/types/database";

/** One-time login on a worker's own phone: phone number, then PIN. */
export function PhoneLogin({ businessName }: { businessName: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PunchError | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  async function onPin(pin: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await workerLogin(phone, pin);
      if (res.ok) {
        router.replace("/punch");
        router.refresh();
        return;
      }
      setError(res);
      setErrorKey((k) => k + 1);
      if (res.error === "not_found") setStep("phone");
    } catch {
      setError(OFFLINE_ERROR);
      setErrorKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <Button asChild variant="ghost" size="xl" className="self-start">
        <Link href="/punch">
          <ArrowLeft /> Back
        </Link>
      </Button>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Smartphone className="text-muted-foreground size-14" />
        <div className="text-center">
          <div className="text-muted-foreground">{businessName}</div>
          <h1 className="text-2xl font-bold">{step === "phone" ? "Your phone number" : "Enter your PIN"}</h1>
          <div className="text-muted-foreground">{step === "phone" ? "अपना मोबाइल नंबर" : "अपना PIN डालें"}</div>
        </div>

        {step === "phone" ? (
          <form
            className="flex w-full max-w-xs flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (phone.replace(/\D/g, "").length >= 6) {
                setError(null);
                setStep("pin");
              }
            }}
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              className="h-16 text-center text-3xl tracking-wider"
            />
            <Button type="submit" size="xl">
              Next
            </Button>
          </form>
        ) : (
          <>
            <PinPad busy={busy} errorKey={errorKey} onComplete={onPin} />
            <Button variant="ghost" onClick={() => setStep("phone")}>
              Change number ({phone})
            </Button>
          </>
        )}
        {error && <ErrorBox error={error} />}
        <p className="text-muted-foreground max-w-xs text-center text-sm">
          You only do this once. This phone stays logged in for 90 days.
        </p>
      </div>
    </div>
  );
}
