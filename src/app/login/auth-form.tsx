"use client";

import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useFormAction<AuthState>(signIn, {});
  const [signUpState, signUpAction, signingUp] = useFormAction<AuthState>(signUp, {});
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{mode === "signin" ? "Owner sign in" : "Create account"}</CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Manage workers, attendance and salary."
            : "One account per business. Workers don't need one."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted mb-6 grid grid-cols-2 rounded-lg p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md py-1.5 font-medium",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {m === "signin" ? "Sign in" : "New account"}
            </button>
          ))}
        </div>

        <form onSubmit={mode === "signin" ? signInAction : signUpAction} className="grid gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          {mode === "signup" && (
            <div className="grid gap-2">
              <Label htmlFor="business_name">Business name</Label>
              <Input id="business_name" name="business_name" placeholder="Sharma Engineering Works" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </div>

          {state.error && (
            <p role="alert" className="text-destructive text-sm">
              {state.error}
            </p>
          )}
          {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}

          <Button type="submit" size="lg" disabled={pending}>
            {mode === "signin" ? <LogIn /> : <UserPlus />}
            {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
