import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type Supabase } from "@/lib/supabase/server";

export type Permission =
  | "members.read" | "members.write" | "members.notes" | "dues.read" | "dues.write"
  | "prospects.read" | "prospects.write" | "prospects.convert"
  | "events.read" | "events.write"
  | "attendance.read" | "attendance.import" | "attendance.write" | "unmatched.resolve"
  | "standing.read" | "discipline.read" | "discipline.propose" | "discipline.approve"
  | "policies.read" | "policies.write" | "policies.approve"
  | "recognition.read" | "recognition.manage" | "recognition.nominate" | "recognition.vote" | "recognition.approve"
  | "points.read" | "points.manage" | "points.award"
  | "reports.export" | "reports.sensitive"
  | "semesters.manage" | "settings.manage" | "users.manage" | "audit.read" | "backup.manage" | "data.migrate";

export type SessionContext = {
  supabase: Supabase;
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
  permissions: Set<Permission>;
  isSuperAdmin: boolean;
  isOfficer: boolean;
  can: (p: Permission) => boolean;
};

/**
 * Reads the signed-in officer, their roles and permissions. Cached per request.
 * Uses getUser(), which verifies the session with Supabase Auth (not just the cookie).
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const [{ data: profile }, { data: roles }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_active").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_roles").select("role_key").eq("user_id", auth.user.id),
    supabase.rpc("my_permissions"),
  ]);
  const active = profile?.is_active !== false;
  const roleKeys = active ? (roles ?? []).map((r) => r.role_key) : [];
  const permissions = new Set<Permission>(active ? ((perms ?? []) as unknown as Permission[]) : []);
  return {
    supabase,
    userId: auth.user.id,
    email: auth.user.email ?? profile?.email ?? "",
    fullName: profile?.full_name ?? null,
    roles: roleKeys,
    permissions,
    isSuperAdmin: roleKeys.includes("super_admin"),
    isOfficer: roleKeys.length > 0,
    can: (p) => permissions.has(p),
  };
});

/** For pages: signed-in officer required, otherwise redirect. */
export async function requireOfficer(): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.isOfficer) redirect("/no-access");
  return s;
}

/** For pages: a specific permission is required. */
export async function requirePermission(...anyOf: Permission[]): Promise<SessionContext> {
  const s = await requireOfficer();
  if (anyOf.length && !anyOf.some((p) => s.can(p))) redirect(`/no-access?need=${encodeURIComponent(anyOf.join(" or "))}`);
  return s;
}

export class PermissionError extends Error {}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertPermission(...anyOf: Permission[]): Promise<SessionContext> {
  const s = await getSession();
  if (!s || !s.isOfficer) throw new PermissionError("You are not signed in as an officer.");
  if (anyOf.length && !anyOf.some((p) => s.can(p))) throw new PermissionError(`You need the ${anyOf.join(" or ")} permission.`);
  return s;
}
