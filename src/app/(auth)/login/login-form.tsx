"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signIn} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-xs">
        <Link href="/auth/forgot-password" className="text-brand hover:underline">Forgot your password?</Link>
      </p>
    </ActionForm>
  );
}
