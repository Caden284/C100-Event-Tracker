"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { check, int, isUuid, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { isValidEmail, normalizeEmail } from "@/lib/domain/normalize";

export async function createMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const s = await assertPermission("members.write");
    const first = str(fd, "first_name");
    const last = str(fd, "last_name");
    if (!first && !last) throw new UserError("Enter a name.");
    const email = normalizeEmail(str(fd, "email"));
    if (email && !isValidEmail(email)) throw new UserError("That email is not valid.");
    if (email) {
      const { data: owner } = await s.supabase.from("v_people_directory").select("person_id, member_id, prospect_id, display_name").eq("email", email).maybeSingle();
      if (owner?.member_id) throw new UserError(`${owner.display_name} already has a member record with that email.`);
      if (owner?.prospect_id) throw new UserError(`${owner.display_name} is a prospective member with that email — use “Convert to member” on their record so their history is kept.`);
    }
    const person = check(await s.supabase.from("people").insert({ first_name: first, last_name: last }).select("id").single());
    if (email) check(await s.supabase.from("person_identifiers").insert({ person_id: person.id, kind: "email", value: email, is_primary: true }));
    const m = check(await s.supabase.from("members").insert({
      person_id: person.id, status_key: str(fd, "status_key") ?? "not_verified", eboard_role: str(fd, "eboard_role"),
      committee: str(fd, "committee"), member_since: str(fd, "member_since"), change_reason: str(fd, "reason") ?? "Added manually",
    }).select("id").single());
    id = m.id;
    revalidatePath("/members");
  });
  if (res?.ok) redirect(`/members/${id}`);
  return res;
}

export async function updateMember(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("members.write");
    const id = req(fd, "member_id");
    const m = check(await s.supabase.from("members").select("person_id, status_key").eq("id", id).single());
    const status = req(fd, "status_key");
    const reason = str(fd, "reason");
    if (status !== m.status_key && (!reason || reason.length < 5)) throw new UserError("Give a reason (5+ characters) for the status change. It is kept in the member's history.");
    check(await s.supabase.from("people").update({ first_name: str(fd, "first_name"), last_name: str(fd, "last_name"), preferred_name: str(fd, "preferred_name"), change_reason: reason ?? "Profile edited" }).eq("id", m.person_id));
    check(await s.supabase.from("members").update({
      status_key: status, eboard_role: str(fd, "eboard_role"), committee: str(fd, "committee"), member_since: str(fd, "member_since"),
      change_reason: reason ?? "Profile edited",
    }).eq("id", id));
    const email = normalizeEmail(str(fd, "email"));
    if (email) check(await s.supabase.rpc("set_primary_email", { p_person: m.person_id, p_email: email, p_reason: reason ?? "Email updated" }));
    revalidatePath(`/members/${id}`); revalidatePath("/members"); revalidatePath("/");
    return "Member saved.";
  });
}

export async function addNote(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("members.notes", "members.write");
    if (!s.can("members.notes")) throw new UserError("You cannot add private notes.");
    check(await s.supabase.from("member_notes").insert({ member_id: req(fd, "member_id"), body: req(fd, "body", "Note").slice(0, 4000) }));
    revalidatePath(`/members/${req(fd, "member_id")}`);
    return "Note added.";
  });
}

export async function recordDues(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("dues.write");
    const amount = str(fd, "amount");
    const cents = amount ? Math.round(Number(amount) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) throw new UserError("Invalid amount.");
    check(await s.supabase.from("member_dues").upsert({
      member_id: req(fd, "member_id"), semester_id: req(fd, "semester_id"), status: req(fd, "status"),
      amount_cents: cents, paid_on: str(fd, "paid_on"), note: str(fd, "note"), recorded_by: s.userId,
    }, { onConflict: "member_id,semester_id" }));
    revalidatePath(`/members/${req(fd, "member_id")}`); revalidatePath("/");
    return "Dues recorded.";
  });
}

export async function bulkStatus(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("members.write");
    const ids = fd.getAll("member_id").map(String).filter(isUuid);
    const status = req(fd, "bulk_status", "New status");
    const reason = req(fd, "bulk_reason", "Reason");
    if (!ids.length) throw new UserError("Tick at least one member.");
    if (ids.length > 200) throw new UserError("Update at most 200 members at a time.");
    if (reason.length < 5) throw new UserError("Give a reason of at least 5 characters.");
    check(await s.supabase.from("members").update({ status_key: status, change_reason: `Bulk update: ${reason}` }).in("id", ids));
    revalidatePath("/members"); revalidatePath("/");
    return `${ids.length} member(s) set to ${status.replace("_", " ")}. Each change is in their history.`;
  });
}

export async function recordStrike(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("discipline.propose");
    const points = int(fd, "points") ?? 1;
    check(await s.supabase.from("strike_records").insert({
      member_id: req(fd, "member_id"), semester_id: str(fd, "semester_id"), policy_id: str(fd, "policy_id"),
      points, reason: req(fd, "reason", "Reason"),
    }));
    revalidatePath(`/members/${req(fd, "member_id")}`); revalidatePath("/standing");
    return "Strike recorded. Under a draft policy this is tracking only — it is not a disciplinary decision.";
  });
}

export async function voidStrike(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("discipline.propose");
    check(await s.supabase.from("strike_records").update({ voided_at: new Date().toISOString(), voided_by: s.userId, void_reason: req(fd, "void_reason", "Reason") }).eq("id", req(fd, "id")));
    revalidatePath(`/members/${req(fd, "member_id")}`); revalidatePath("/standing");
    return "Strike voided (kept in history).";
  });
}
