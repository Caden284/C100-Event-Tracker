"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  /** When set, a confirmation dialog is shown before the action runs. */
  confirm?: { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  showMessage?: boolean;
};

export function ActionForm({ action, children, className, confirm, resetOnSuccess, onSuccess, showMessage = true }: Props) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  // The button that opened the confirmation, so its name/value is still submitted afterwards.
  const submitter = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.at]);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirm && !confirmed.current) {
            e.preventDefault();
            submitter.current = (e.nativeEvent as SubmitEvent).submitter ?? null;
            dialogRef.current?.showModal();
            return;
          }
          confirmed.current = false;
        }}
      >
        {children}
        {showMessage ? <FormMessage state={state} /> : null}
      </form>
      {confirm ? (
        <dialog
          ref={dialogRef}
          className="m-auto w-[min(92vw,28rem)] rounded-lg border border-slate-200 p-0 shadow-xl"
          aria-labelledby="confirm-title"
        >
          <div className="space-y-3 p-5">
            <h2 id="confirm-title" className="text-base font-semibold text-ink">{confirm.title}</h2>
            {confirm.body ? <div className="text-sm text-slate-600">{confirm.body}</div> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <Button variant="secondary" onClick={() => dialogRef.current?.close()} autoFocus>
              Cancel
            </Button>
            <Button
              variant={confirm.danger ? "danger" : "primary"}
              onClick={() => {
                confirmed.current = true;
                dialogRef.current?.close();
                const btn = submitter.current;
                formRef.current?.requestSubmit(btn instanceof HTMLButtonElement || btn instanceof HTMLInputElement ? btn : undefined);
              }}
            >
              {confirm.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
      )}
    >
      {state.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />}
      <span>{state.ok ? state.message : state.error}</span>
    </p>
  );
}

export function SubmitButton({ children, variant = "primary", size, className, pendingLabel, name, value, disabled }: {
  children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingLabel?: string; name?: string; value?: string; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} name={name} value={value} aria-busy={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
