import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { PermissionError } from "@/lib/auth";
import type { ActionState } from "@/lib/action-state";

export class UserError extends Error {}

/** Converts database / permission errors into messages an officer can act on. */
export function friendlyError(e: unknown): string {
  if (e instanceof PermissionError || e instanceof UserError) return e.message;
  const pe = e as Partial<PostgrestError> & { message?: string };
  if (pe && typeof pe === "object" && "code" in pe) {
    if (pe.code === "23505") {
      if (pe.message?.includes("attendance_one_per_person_event")) return "That person already has an attendance record for this event.";
      if (pe.message?.includes("person_identifiers")) return "That email or card ID already belongs to another person.";
      return "This record already exists (duplicate).";
    }
    if (pe.code === "23503") return "This record is referenced by other records and cannot be changed that way.";
    if (pe.code === "23514") return `A value is not allowed: ${pe.message}`;
    if (pe.code === "42501") return pe.message?.replace(/^Permission denied: /, "Permission denied — ") ?? "Permission denied.";
    if (pe.code === "PGRST116") return "Record not found.";
  }
  if (pe?.message) return pe.message;
  return "Something went wrong. Please try again.";
}

/**
 * Throws if a Supabase call returned an error. Typed as non-null for convenience
 * (callers that don't select data simply ignore the return value).
 */
export function check<T>(res: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

/** Runs an action body and returns an ActionState (never throws, except redirects). */
export async function run(fn: () => Promise<string | void | { message?: string; data?: Record<string, unknown> }>): Promise<ActionState> {
  try {
    const out = await fn();
    if (typeof out === "string") return { ok: true, message: out, at: Date.now() };
    return { ok: true, message: out?.message ?? "Saved.", data: out?.data, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    console.error("[action]", e);
    return { ok: false, error: friendlyError(e), at: Date.now() };
  }
}

export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v === null || typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function req(fd: FormData, key: string, label = key): string {
  const v = str(fd, key);
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UserError(`${key} must be a number.`);
  return Math.trunc(n);
}

export function isUuid(v: string | null | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
