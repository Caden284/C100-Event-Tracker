"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { setPassword } from "./actions";

export function PasswordForm() {
  return (
    <ActionForm action={setPassword} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 10 characters, including a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full">Save password</SubmitButton>
    </ActionForm>
  );
}
