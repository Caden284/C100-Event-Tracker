"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import { SITE_URL } from "@/lib/env";

function safeNext(next: string | null): string {
  // Only allow local paths (prevents open redirects).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password.", at: Date.now() };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic message: do not reveal whether the account exists.
    return { ok: false, error: "Email or password is incorrect, or your account is not active.", at: Date.now() };
  }
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter your email.", at: Date.now() };
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? SITE_URL;
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/account/password` });
  return { ok: true, message: "If that email belongs to an officer account, a reset link has been sent. (Email delivery requires an email provider to be configured in Supabase.)", at: Date.now() };
}
