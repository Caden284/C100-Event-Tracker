"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { bool, check, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { isValidEmail, normalizeEmail } from "@/lib/domain/normalize";

export async function createProspect(_p: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const s = await assertPermission("prospects.write");
    const first = str(fd, "first_name"), last = str(fd, "last_name");
    if (!first && !last) throw new UserError("Enter a name.");
    const email = normalizeEmail(str(fd, "email"));
    if (email && !isValidEmail(email)) throw new UserError("That email is not valid.");
    if (email) {
      const { data: owner } = await s.supabase.from("v_people_directory").select("display_name").eq("email", email).maybeSingle();
      if (owner) throw new UserError(`${owner.display_name} already uses that email.`);
    }
    const person = check(await s.supabase.from("people").insert({ first_name: first, last_name: last }).select("id").single());
    if (email) check(await s.supabase.from("person_identifiers").insert({ person_id: person.id, kind: "email", value: email, is_primary: true }));
    const p = check(await s.supabase.from("prospective_members").insert({ person_id: person.id, semester_id: str(fd, "semester_id"), notes: str(fd, "notes") }).select("id").single());
    id = p.id;
    revalidatePath("/prospects");
  });
  if (res?.ok) redirect(`/prospects/${id}`);
  return res;
}

export async function updateProspect(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("prospects.write");
    const id = req(fd, "prospect_id");
    const p = check(await s.supabase.from("prospective_members").select("person_id").eq("id", id).single());
    check(await s.supabase.from("people").update({ first_name: str(fd, "first_name"), last_name: str(fd, "last_name") }).eq("id", p.person_id));
    check(await s.supabase.from("prospective_members").update({
      follow_up_status: req(fd, "follow_up_status"), assigned_officer_id: str(fd, "assigned_officer_id"), next_steps: str(fd, "next_steps"),
      notes: str(fd, "notes"), interest_override: str(fd, "interest_override"), status: req(fd, "status"),
      change_reason: str(fd, "reason") ?? "Updated",
    }).eq("id", id));
    const email = normalizeEmail(str(fd, "email"));
    if (email) check(await s.supabase.rpc("set_primary_email", { p_person: p.person_id, p_email: email, p_reason: "Email updated" }));
    revalidatePath(`/prospects/${id}`); revalidatePath("/prospects");
    return "Saved.";
  });
}

export async function convertProspect(_p: ActionState, fd: FormData): Promise<ActionState> {
  let memberId = "";
  const res = await run(async () => {
    const s = await assertPermission("prospects.convert");
    if (!bool(fd, "confirm_identity") || !bool(fd, "confirm_membership")) throw new UserError("Confirm both checks before converting.");
    memberId = check(await s.supabase.rpc("convert_prospect_to_member", {
      p_prospect: req(fd, "prospect_id"), p_member_since: req(fd, "member_since", "Membership start date"),
      p_semester: req(fd, "semester_id", "Semester"), p_status: req(fd, "status_key"), p_reason: req(fd, "reason", "How membership was confirmed"),
    })) as unknown as string;
    revalidatePath("/prospects"); revalidatePath("/members"); revalidatePath("/");
  });
  if (res?.ok) redirect(`/members/${memberId}`);
  return res;
}
