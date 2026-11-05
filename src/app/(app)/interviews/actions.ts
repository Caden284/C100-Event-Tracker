"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth";
import { check, friendlyError, int, isUuid, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { easternLocalToIso } from "@/lib/domain/dates";
import { normalizeEmail, isValidEmail } from "@/lib/domain/normalize";

const draftSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5).nullable()),
  answers: z.record(z.string(), z.string().max(5000)),
  own_question: z.string().max(1000),
  own_notes: z.string().max(5000),
  recommendation: z.enum(["strong_yes", "yes", "lean_no", "no"]).nullable(),
  red_flag: z.boolean(),
  red_flag_note: z.string().max(2000),
  notes: z.string().max(5000),
});
export type InterviewDraft = z.infer<typeof draftSchema>;

const blankToNull = (v: string) => (v.trim() ? v : null);

/** Autosave (submit = false) or submit (submit = true) the signed-in interviewer's sheet. */
export async function saveInterview(applicantId: string, draft: InterviewDraft, submit: boolean): Promise<{ ok: true; savedAt: string; submittedAt: string | null } | { ok: false; error: string }> {
  try {
    const s = await assertPermission("interviews.conduct");
    if (!isUuid(applicantId)) throw new UserError("Unknown applicant.");
    const d = draftSchema.parse(draft);
    const scores = Object.fromEntries(Object.entries(d.scores).filter(([, v]) => v !== null));
    const answers = Object.fromEntries(Object.entries(d.answers).filter(([, v]) => v.trim()));
    const row = {
      applicant_id: applicantId, interviewer_id: s.userId, scores, answers,
      own_question: blankToNull(d.own_question), own_notes: blankToNull(d.own_notes), recommendation: d.recommendation,
      red_flag: d.red_flag, red_flag_note: d.red_flag ? blankToNull(d.red_flag_note) : null, notes: blankToNull(d.notes),
      ...(submit ? { submitted_at: new Date().toISOString() } : {}),
    };
    const saved = check(await s.supabase.from("interview_scores").upsert(row, { onConflict: "applicant_id,interviewer_id" }).select("updated_at, submitted_at").single());
    if (submit) {
      check(await s.supabase.from("intake_applicants").update({ status: "completed" }).eq("id", applicantId).neq("status", "completed"));
      revalidatePath("/interviews");
    }
    return { ok: true, savedAt: saved.updated_at, submittedAt: saved.submitted_at };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Some answers are too long or a score is out of range." };
    return { ok: false, error: friendlyError(e) };
  }
}

export async function claimInterview(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.conduct");
    const id = req(fd, "id");
    const res = check(await s.supabase.from("intake_applicants").update({ interviewer_id: s.userId }).eq("id", id).is("interviewer_id", null).select("id"));
    if (!res.length) throw new UserError("Someone else has already taken this interview.");
    revalidatePath("/interviews"); revalidatePath(`/interviews/${id}`);
    return "It's yours. Open the sheet when the call starts.";
  });
}

/** Hand an interview back, e.g. "I know this applicant personally" (packet page 5). */
export async function releaseInterview(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.conduct", "interviews.manage");
    const id = req(fd, "id");
    const reason = str(fd, "reason") ?? "Handed back";
    check(await s.supabase.from("intake_applicants").update({ interviewer_id: null }).eq("id", id));
    await s.supabase.rpc("notify_permission", { p_permission: "interviews.manage", p_type: "interview_released", p_title: "An interview needs a new interviewer", p_body: reason, p_link: `/interviews/${id}`, p_group_key: `interview-release-${id}` });
    revalidatePath("/interviews"); revalidatePath(`/interviews/${id}`);
    return "Handed back. The coordinator has been told it needs a new interviewer.";
  });
}

export async function setInterviewStatus(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.conduct", "interviews.manage");
    const id = req(fd, "id"), status = req(fd, "status");
    if (!["scheduled", "completed", "no_show", "rescheduled", "withdrawn"].includes(status)) throw new UserError("Unknown status.");
    check(await s.supabase.from("intake_applicants").update({ status }).eq("id", id));
    revalidatePath("/interviews"); revalidatePath(`/interviews/${id}`);
    return status === "no_show" ? "Marked as a no-show." : "Status updated.";
  });
}

export async function assignInterview(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const id = req(fd, "id");
    const interviewer = str(fd, "interviewer_id");
    if (interviewer && !isUuid(interviewer)) throw new UserError("Choose an interviewer.");
    const slot = str(fd, "slot_at");
    const slotIso = slot ? easternLocalToIso(slot) : null;
    if (slot && !slotIso) throw new UserError("Enter a valid date and time.");
    check(await s.supabase.from("intake_applicants").update({ interviewer_id: interviewer, slot_at: slotIso, slot_note: str(fd, "slot_note") }).eq("id", id));
    revalidatePath("/interviews"); revalidatePath(`/interviews/${id}`);
    return "Assignment saved.";
  });
}

export async function updateApplicantFacts(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const id = req(fd, "id");
    const gpa = str(fd, "gpa");
    check(await s.supabase.from("intake_applicants").update({
      group_label: str(fd, "group_label"), tier: str(fd, "tier"), classification: str(fd, "classification"), major: str(fd, "major"),
      gpa: gpa === null ? null : Number(gpa), hours_offered: str(fd, "hours_offered"),
    }).eq("id", id));
    revalidatePath(`/interviews/${id}`);
    return "Details saved.";
  });
}

export async function updateCycle(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const dues = str(fd, "dues_amount");
    check(await s.supabase.from("intake_cycles").update({
      name: req(fd, "name", "Name"), spots: int(fd, "spots") ?? 35, decisions_by: str(fd, "decisions_by"),
      dues_amount_cents: dues === null ? null : Math.round(Number(dues) * 100), dues_due: str(fd, "dues_due"),
    }).eq("id", req(fd, "id")));
    revalidatePath("/interviews", "layout");
    return "Intake settings saved.";
  });
}

export async function setCyclePhase(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const status = req(fd, "status");
    if (!["setup", "interviewing", "deliberation", "closed"].includes(status)) throw new UserError("Unknown phase.");
    if (status === "deliberation" && str(fd, "confirm_text") !== "LOCK") throw new UserError("Type LOCK to open deliberation.");
    check(await s.supabase.from("intake_cycles").update({ status }).eq("id", req(fd, "id")));
    revalidatePath("/interviews", "layout");
    return status === "deliberation" ? "Deliberation is open. Scores are locked and visible to the board." : "Phase updated.";
  });
}

export async function recountEngagement(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const cutoff = req(fd, "cutoff", "Cutoff date");
    const n = check(await s.supabase.rpc("count_intake_engagement", { p_cycle: req(fd, "id"), p_cutoff: cutoff }));
    revalidatePath("/interviews", "layout");
    return `Engagement counted for ${n} applicants from attendance through ${cutoff}.`;
  });
}

/** Adds an applicant: an existing person, or a new prospective member by name (email optional). */
export async function addApplicant(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const cycleId = req(fd, "cycle_id");
    let personId = str(fd, "person_id");
    if (!personId) {
      if (!s.can("prospects.write")) throw new UserError("Adding a new person needs permission to create prospective members.");
      const first = req(fd, "first_name", "First name"), last = str(fd, "last_name");
      const email = str(fd, "email") ? normalizeEmail(str(fd, "email")) : null;
      if (email && !isValidEmail(email)) throw new UserError("That email doesn't look right.");
      const person = check(await s.supabase.from("people").insert({ first_name: first, last_name: last, change_reason: "Added as an intake applicant" }).select("id").single());
      personId = person.id;
      if (email) check(await s.supabase.from("person_identifiers").insert({ person_id: person.id, kind: "email", value: email, is_primary: true, source: "manual" }));
      check(await s.supabase.from("prospective_members").insert({ person_id: person.id, notes: "Added as an intake applicant" }));
    }
    const gpa = str(fd, "gpa");
    check(await s.supabase.from("intake_applicants").insert({
      cycle_id: cycleId, person_id: personId, group_label: str(fd, "group_label"), tier: str(fd, "tier"),
      classification: str(fd, "classification"), major: str(fd, "major"), gpa: gpa === null ? null : Number(gpa), hours_offered: str(fd, "hours_offered"),
    }));
    revalidatePath("/interviews", "layout");
    return "Applicant added. Recount engagement to give them their points.";
  });
}

export async function setDecision(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("interviews.manage");
    const decision = str(fd, "decision");
    if (decision && !["offer", "waitlist", "decline"].includes(decision)) throw new UserError("Unknown decision.");
    check(await s.supabase.from("intake_applicants").update({
      decision, waitlist_rank: decision === "waitlist" ? int(fd, "waitlist_rank") : null, decision_note: str(fd, "decision_note"),
    }).eq("id", req(fd, "id")));
    revalidatePath("/interviews", "layout");
    return "Decision recorded.";
  });
}
