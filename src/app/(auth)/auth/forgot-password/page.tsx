"use client";

import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { requestPasswordReset } from "../../login/actions";

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold text-ink">Reset your password</h2>
      <p className="mb-4 text-sm text-slate-600">We will email you a link to choose a new password.</p>
      <ActionForm action={requestPasswordReset} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoFocus />
        </Field>
        <SubmitButton className="w-full">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-xs"><Link href="/login" className="text-brand hover:underline">Back to sign in</Link></p>
    </>
  );
}
