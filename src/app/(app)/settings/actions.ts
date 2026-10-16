"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { assertPermission } from "@/lib/auth";
import { bool, check, int, isUuid, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { policyRulesSchema, validateRules } from "@/lib/domain/policy";
import { SITE_URL } from "@/lib/env";

// ---------------------------------------------------------------- semesters
export async function saveSemester(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("semesters.manage");
    const term = req(fd, "term");
    const year = int(fd, "year");
    if (!year || year < 2000 || year > 2100) throw new UserError("Enter a valid year.");
    const start = req(fd, "start_date"), end = req(fd, "end_date");
    if (end < start) throw new UserError("End date is before start date.");
    const row = {
      name: `${term} ${year}`, term, academic_year: term === "Fall" ? `${year}-${year + 1}` : `${year - 1}-${year}`,
      start_date: start, end_date: end, dues_deadline: str(fd, "dues_deadline"), notes: str(fd, "notes"),
    };
    const id = str(fd, "id");
    if (id) check(await s.supabase.from("semesters").update(row).eq("id", id));
    else check(await s.supabase.from("semesters").insert({ ...row, status: "upcoming" }));
    revalidatePath("/settings/semesters"); revalidatePath("/", "layout");
    return "Semester saved.";
  });
}

export async function assignPolicy(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("semesters.manage", "policies.approve");
    check(await s.supabase.rpc("assign_policy_to_semester", { p_semester: req(fd, "semester_id"), p_policy: req(fd, "policy_id"), p_reason: str(fd, "reason") ?? undefined }));
    revalidatePath("/", "layout");
    return "Policy assigned. Standing for that semester now uses it.";
  });
}

export async function rollover(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("semesters.manage");
    if (str(fd, "confirm_text") !== "ROLLOVER") throw new UserError('Type ROLLOVER to confirm.');
    const res = check(await s.supabase.rpc("rollover_semester", { p_from: req(fd, "from"), p_to: req(fd, "to"), p_reason: str(fd, "reason") ?? undefined })) as { activated: string; warnings: string[] };
    revalidatePath("/", "layout");
    return `Rollover complete — ${res.activated} is now the current semester. History was preserved.${res.warnings.length ? ` Note: ${res.warnings.join(" ")}` : ""}`;
  });
}

// ---------------------------------------------------------------- policies
function rulesFromForm(fd: FormData) {
  const reqs = [];
  for (let i = 0; i < 12; i++) {
    const label = str(fd, `req_label_${i}`);
    if (!label) continue;
    reqs.push({
      key: (str(fd, `req_key_${i}`) ?? label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `req_${i}`,
      label, required: int(fd, `req_required_${i}`) ?? 0, categories: fd.getAll(`req_cats_${i}`).map(String),
    });
  }
  const thresholds = [];
  for (let i = 0; i < 6; i++) {
    const label = str(fd, `strike_label_${i}`);
    const n = int(fd, `strike_n_${i}`);
    if (label && n) thresholds.push({ strikes: n, label, action: str(fd, `strike_action_${i}`) ?? "other" });
  }
  const mult = str(fd, "standout_multiplier");
  const parsed = policyRulesSchema.safeParse({
    requirements: reqs, dues_required_for_good_standing: bool(fd, "dues_required"), standout_multiplier: mult ? Number(mult) : null,
    excused_counts_as_attended: bool(fd, "excused_counts"), waivers_allowed: bool(fd, "waivers_allowed"),
    credit_pre_membership_attendance: bool(fd, "credit_pre_membership"), tracked_statuses: fd.getAll("tracked_statuses").map(String),
    at_risk_enabled: bool(fd, "at_risk_enabled"), strikes: { enabled: bool(fd, "strikes_enabled"), thresholds },
    probation_criteria: str(fd, "probation_criteria") ?? "", review_process: str(fd, "review_process") ?? "", appeal_process: str(fd, "appeal_process") ?? "",
  });
  if (!parsed.success) throw new UserError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const problems = validateRules(parsed.data);
  if (problems.length) throw new UserError(problems.join(" "));
  return parsed.data;
}

export async function savePolicyDraft(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("policies.write");
    const rules = rulesFromForm(fd);
    check(await s.supabase.from("membership_policies").update({ rules: rules as never, name: req(fd, "name"), summary: str(fd, "summary"), effective_from: str(fd, "effective_from") }).eq("id", req(fd, "id")).eq("status", "draft"));
    revalidatePath(`/settings/policies/${req(fd, "id")}`); revalidatePath("/", "layout");
    return "Draft saved. It still needs approval before it governs official decisions.";
  });
}

export async function newPolicyVersion(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const s = await assertPermission("policies.write");
    const src = check(await s.supabase.from("membership_policies").select("name, rules, summary, effective_semester_id").eq("id", req(fd, "from_id")).single());
    const { data: max } = await s.supabase.from("membership_policies").select("version").eq("name", src.name).order("version", { ascending: false }).limit(1).maybeSingle();
    const row = check(await s.supabase.from("membership_policies").insert({ name: src.name, version: (max?.version ?? 0) + 1, rules: src.rules, summary: `Draft based on v${max?.version ?? 1}`, effective_semester_id: str(fd, "semester_id") ?? src.effective_semester_id }).select("id").single());
    id = row.id;
  });
  if (res?.ok) redirect(`/settings/policies/${id}`);
  return res;
}

export async function requestApproval(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("policies.write");
    check(await s.supabase.from("membership_policies").update({ approval_requested_at: new Date().toISOString(), approval_requested_by: s.userId, approval_note: str(fd, "note") }).eq("id", req(fd, "id")));
    await s.supabase.rpc("notify_permission", { p_permission: "policies.approve", p_type: "policy_approval", p_title: "A policy draft is awaiting approval", p_link: `/settings/policies/${req(fd, "id")}`, p_group_key: `policy-${req(fd, "id")}` });
    revalidatePath(`/settings/policies/${req(fd, "id")}`);
    return "Approval requested. Approvers have been notified in the hub.";
  });
}

export async function decidePolicy(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("policies.approve");
    const status = req(fd, "status");
    if (!["approved", "retired"].includes(status)) throw new UserError("Invalid decision.");
    if (str(fd, "confirm_text") !== (status === "approved" ? "APPROVE" : "RETIRE")) throw new UserError(`Type ${status === "approved" ? "APPROVE" : "RETIRE"} to confirm.`);
    check(await s.supabase.from("membership_policies").update({ status, approval_note: req(fd, "note", "Approval record (meeting, vote, date)") }).eq("id", req(fd, "id")));
    revalidatePath("/", "layout");
    return status === "approved" ? "Policy approved. It is now locked; future changes need a new version." : "Policy retired.";
  });
}

// ---------------------------------------------------------------- categories & statuses
export async function saveCategoryConfig(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("settings.manage");
    const key = str(fd, "key");
    const row = { name: req(fd, "name"), description: str(fd, "description"), is_active: bool(fd, "is_active"), is_recruitment: bool(fd, "is_recruitment"), sort_order: int(fd, "sort_order") ?? 10 };
    if (str(fd, "existing")) check(await s.supabase.from("event_categories").update(row).eq("key", key!));
    else check(await s.supabase.from("event_categories").insert({ ...row, key: (key ?? row.name).toLowerCase().replace(/[^a-z0-9]+/g, "_") }));
    revalidatePath("/settings/categories");
    return "Category saved. Historical events keep their category even if it is deactivated.";
  });
}

export async function saveStatusConfig(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("settings.manage");
    const table = req(fd, "table");
    if (table === "member_statuses") {
      const row = { name: req(fd, "name"), description: str(fd, "description"), counts_as_active: bool(fd, "counts_as_active"), is_tracked: bool(fd, "is_tracked"), is_active: bool(fd, "is_active") };
      if (str(fd, "existing")) check(await s.supabase.from("member_statuses").update(row).eq("key", req(fd, "key")));
      else check(await s.supabase.from("member_statuses").insert({ ...row, key: req(fd, "name").toLowerCase().replace(/[^a-z0-9]+/g, "_"), sort_order: 50 }));
    } else if (table === "attendance_statuses") {
      check(await s.supabase.from("attendance_statuses").update({ is_active: bool(fd, "is_active"), pin_aliases: (str(fd, "pin_aliases") ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) }).eq("key", req(fd, "key")));
    } else throw new UserError("Unknown table.");
    revalidatePath("/settings/categories");
    return "Saved.";
  });
}

export async function saveAppSettings(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("settings.manage");
    const high = int(fd, "high_min_events") ?? 3, med = int(fd, "medium_min_events") ?? 2;
    if (med > high) throw new UserError("Medium must not exceed High.");
    const margin = Number(str(fd, "behind_pace_margin") ?? "0.25");
    if (!(margin >= 0 && margin <= 1)) throw new UserError("Margin must be between 0 and 1.");
    const upserts = [
      { key: "prospect_engagement", value: { high_min_events: high, medium_min_events: med, count_all_categories: true } },
      { key: "at_risk", value: { behind_pace_margin: margin } },
      { key: "import_limits", value: { max_file_mb: Math.min(10, int(fd, "max_file_mb") ?? 5), max_rows: Math.min(20000, int(fd, "max_rows") ?? 5000) } },
    ];
    for (const u of upserts) check(await s.supabase.from("app_settings").upsert(u as never));
    revalidatePath("/", "layout");
    return "Settings saved.";
  });
}

// ---------------------------------------------------------------- users & roles
export async function inviteOfficer(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    const email = req(fd, "email", "Email").toLowerCase();
    const name = str(fd, "full_name");
    const roles = fd.getAll("roles").map(String);
    if (roles.includes("super_admin") && !s.isSuperAdmin) throw new UserError("Only a super administrator can grant that role.");
    const admin = createAdminClient();
    const method = str(fd, "method") ?? "password";
    let userId: string;
    let message: string;
    if (method === "invite") {
      const origin = (await headers()).get("origin") ?? SITE_URL;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: `${origin}/auth/callback?next=/account/password` });
      if (error) throw new UserError(`Invitation failed: ${error.message}. If no email provider is configured, use “temporary password” instead.`);
      userId = data.user.id;
      message = `Invitation emailed to ${email}.`;
    } else {
      const password = randomBytes(9).toString("base64url") + "7k";
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
      if (error) throw new UserError(`Could not create the account: ${error.message}`);
      userId = data.user.id;
      message = `Account created. Give ${email} this one-time password privately (it is not stored and will not be shown again): ${password}`;
    }
    if (name) await admin.from("profiles").update({ full_name: name }).eq("id", userId);
    // Roles are granted with the officer's own session so RLS and the super_admin guard apply.
    if (roles.length) check(await s.supabase.from("user_roles").insert(roles.map((role_key) => ({ user_id: userId, role_key, granted_by: s.userId }))));
    await s.supabase.rpc("log_audit", { p_action: "user.created", p_table: "profiles", p_record_id: userId, p_metadata: { email, roles, method } });
    revalidatePath("/settings/users");
    return message;
  });
}

export async function setRole(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    const userId = req(fd, "user_id"), role = req(fd, "role_key");
    if (!isUuid(userId)) throw new UserError("Unknown user.");
    if (bool(fd, "grant")) check(await s.supabase.from("user_roles").insert({ user_id: userId, role_key: role, granted_by: s.userId }));
    else check(await s.supabase.from("user_roles").delete().eq("user_id", userId).eq("role_key", role));
    revalidatePath("/settings/users");
    return "Roles updated. The change applies on the officer's next page load.";
  });
}

export async function setActive(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    check(await s.supabase.from("profiles").update({ is_active: bool(fd, "active") }).eq("id", req(fd, "user_id")));
    revalidatePath("/settings/users");
    return bool(fd, "active") ? "Account re-activated." : "Account deactivated. They keep no access, but their history stays.";
  });
}

export async function togglePermission(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    if (!s.isSuperAdmin) throw new UserError("Only a super administrator can change role permissions.");
    const role = req(fd, "role_key"), perm = req(fd, "permission_key");
    if (role === "super_admin") throw new UserError("Super administrators always have every permission.");
    if (bool(fd, "grant")) check(await s.supabase.from("role_permissions").insert({ role_key: role, permission_key: perm }));
    else check(await s.supabase.from("role_permissions").delete().eq("role_key", role).eq("permission_key", perm));
    revalidatePath("/settings/users");
    return "Permission updated.";
  });
}

export async function createRole(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    const name = req(fd, "name");
    check(await s.supabase.from("roles").insert({ key: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), name, description: str(fd, "description") }));
    revalidatePath("/settings/users");
    return "Role created. Grant it permissions in the matrix below.";
  });
}

export async function setNotificationPref(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("users.manage");
    check(await s.supabase.from("notification_preferences").upsert({ role_key: req(fd, "role_key"), type: req(fd, "type"), enabled: bool(fd, "enabled") }));
    revalidatePath("/settings/notifications");
    return "Saved.";
  });
}
