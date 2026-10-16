"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

export async function setPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 10) return { ok: false, error: "Use at least 10 characters.", at: Date.now() };
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return { ok: false, error: "Use letters and at least one number.", at: Date.now() };
  if (password !== confirm) return { ok: false, error: "The passwords do not match.", at: Date.now() };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message, at: Date.now() };
  redirect("/");
}
