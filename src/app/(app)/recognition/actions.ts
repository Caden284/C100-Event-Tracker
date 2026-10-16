"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { bool, check, int, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

const num = (fd: FormData, k: string) => { const v = int(fd, k); return v === null ? null : Math.max(0, v); };

export async function saveCategory(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.manage");
    const id = str(fd, "id");
    const audience = req(fd, "audience");
    const rules = audience === "member"
      ? { min_counted_events: num(fd, "min_counted_events"), min_categories_attended: num(fd, "min_categories_attended"), require_member_status: str(fd, "require_active") ? ["active"] : [], min_baseline_events: num(fd, "min_baseline_events") }
      : { min_events_attended: num(fd, "min_events_attended"), min_distinct_months: num(fd, "min_distinct_months") };
    const row = {
      name: req(fd, "name", "Name"), description: str(fd, "description"), audience,
      uses_auto_eligibility: bool(fd, "uses_auto_eligibility"), uses_nominations: bool(fd, "uses_nominations"),
      uses_voting: bool(fd, "uses_voting"), uses_officer_decision: bool(fd, "uses_officer_decision"),
      eligibility_rules: rules, is_active: !bool(fd, "inactive"),
    };
    if (id) check(await s.supabase.from("recognition_categories").update(row).eq("id", id));
    else check(await s.supabase.from("recognition_categories").insert({ ...row, key: row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "award" }));
    revalidatePath("/recognition");
    return "Award saved.";
  });
}

export async function createPeriod(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.manage");
    check(await s.supabase.from("recognition_periods").insert({
      category_id: req(fd, "category_id"), semester_id: req(fd, "semester_id"), name: req(fd, "name", "Name"),
      anonymous_voting: bool(fd, "anonymous_voting"), results_visibility: str(fd, "results_visibility") ?? "approvers",
      max_votes_per_voter: int(fd, "max_votes_per_voter") ?? 1, nomination_closes_at: str(fd, "nomination_closes_at"), voting_closes_at: str(fd, "voting_closes_at"),
    }));
    revalidatePath("/recognition");
    return "Recognition period created.";
  });
}

export async function setPeriodStatus(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.manage");
    const status = req(fd, "status");
    const id = req(fd, "period_id");
    if (status === "finalized" && !s.can("recognition.approve")) throw new UserError("Only an approver can finalize results.");
    check(await s.supabase.from("recognition_periods").update({ status, ...(status === "finalized" ? { finalized_by: s.userId, finalized_at: new Date().toISOString() } : {}) }).eq("id", id));
    if (status === "nominations_open") await s.supabase.rpc("notify_permission", { p_permission: "recognition.nominate", p_type: "nominations_open", p_title: "Nominations are open", p_link: `/recognition/${id}`, p_group_key: `nominations-${id}` });
    if (status === "voting_open") await s.supabase.rpc("notify_permission", { p_permission: "recognition.vote", p_type: "voting_open", p_title: "Voting is open", p_link: `/recognition/${id}`, p_group_key: `voting-${id}` });
    revalidatePath(`/recognition/${id}`); revalidatePath("/recognition");
    return `Period is now ${status.replace(/_/g, " ")}.`;
  });
}

export async function nominate(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.nominate");
    const { error } = await s.supabase.from("recognition_nominations").insert({ period_id: req(fd, "period_id"), nominee_person_id: req(fd, "person_id", "Nominee"), nominated_by: s.userId, justification: str(fd, "justification") });
    if (error?.code === "23505") throw new UserError("You have already nominated this person for this award.");
    if (error) throw error;
    revalidatePath(`/recognition/${req(fd, "period_id")}`);
    return "Nomination submitted.";
  });
}

export async function withdrawNomination(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.nominate", "recognition.manage");
    check(await s.supabase.from("recognition_nominations").delete().eq("id", req(fd, "id")));
    revalidatePath(`/recognition/${req(fd, "period_id")}`);
    return "Nomination withdrawn.";
  });
}

export async function vote(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.vote");
    const { error } = await s.supabase.from("recognition_votes").insert({ period_id: req(fd, "period_id"), nominee_person_id: req(fd, "person_id"), voter_id: s.userId });
    if (error?.code === "23505") throw new UserError("You already voted for this candidate.");
    if (error) throw error;
    revalidatePath(`/recognition/${req(fd, "period_id")}`);
    return "Vote recorded.";
  });
}

export async function retractVote(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.vote");
    check(await s.supabase.from("recognition_votes").delete().eq("period_id", req(fd, "period_id")).eq("nominee_person_id", req(fd, "person_id")).eq("voter_id", s.userId));
    revalidatePath(`/recognition/${req(fd, "period_id")}`);
    return "Vote withdrawn.";
  });
}

export async function saveResult(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("recognition.manage", "recognition.approve");
    const official = bool(fd, "is_official");
    if (official && !s.can("recognition.approve")) throw new UserError("Only an approver can make a result official.");
    check(await s.supabase.from("recognition_results").upsert({
      period_id: req(fd, "period_id"), person_id: req(fd, "person_id", "Recipient"), outcome: str(fd, "outcome") ?? "recipient", is_official: official, note: str(fd, "note"),
    }, { onConflict: "period_id,person_id" }));
    revalidatePath(`/recognition/${req(fd, "period_id")}`);
    return official ? "Official recipient recorded." : "Result saved as unofficial (awaiting approval).";
  });
}

export async function savePointRule(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("points.manage", "policies.approve");
    const points = int(fd, "points");
    if (!points) throw new UserError("Points must be a non-zero whole number.");
    check(await s.supabase.from("point_rules").insert({
      name: req(fd, "name", "Name"), category_key: str(fd, "category_key"), points, semester_id: str(fd, "semester_id"),
      max_awards_per_semester: int(fd, "max_awards_per_semester"), audience: str(fd, "audience") ?? "member", notes: str(fd, "notes"),
    }));
    revalidatePath("/recognition");
    return "Point rule drafted. A policy approver must approve it before it awards points.";
  });
}

export async function setPointRuleStatus(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("policies.approve");
    check(await s.supabase.from("point_rules").update({ status: req(fd, "status") }).eq("id", req(fd, "id")));
    revalidatePath("/recognition");
    return "Rule updated.";
  });
}

export async function awardPoints(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("points.award");
    const n = check(await s.supabase.rpc("award_points_for_semester", { p_semester: req(fd, "semester_id") }));
    revalidatePath("/recognition");
    return `${n} point transaction(s) added. Attendance already awarded is never awarded twice.`;
  });
}

export async function adjustPoints(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("points.award");
    const points = int(fd, "points");
    if (!points) throw new UserError("Enter a non-zero number of points.");
    check(await s.supabase.from("point_transactions").insert({ person_id: req(fd, "person_id", "Person"), semester_id: req(fd, "semester_id"), points, reason: req(fd, "reason", "Reason"), awarded_by: s.userId }));
    revalidatePath("/recognition");
    return "Adjustment recorded.";
  });
}
