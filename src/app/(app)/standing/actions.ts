"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { bool, check, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { listSemesters } from "@/lib/data/semesters";
import { loadStrikeSuggestions } from "@/lib/data/absences";

export async function proposeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    const s = await assertPermission("discipline.propose");
    const override = bool(fd, "is_override");
    if (override && !s.can("discipline.approve")) throw new UserError("Only officers who can approve disciplinary actions may record an override.");
    check(await s.supabase.from("disciplinary_actions").insert({
      member_id: req(fd, "member_id"), semester_id: str(fd, "semester_id"), policy_id: str(fd, "policy_id"),
      action_type: req(fd, "action_type"), reason: req(fd, "reason", "Reason"), effective_date: str(fd, "effective_date"),
      review_date: str(fd, "review_date"), is_override: override, override_reason: override ? req(fd, "override_reason", "Override reason") : null,
    }));
    await s.supabase.rpc("notify_permission", { p_permission: "discipline.approve", p_type: "discipline_proposed", p_title: "A disciplinary action needs review", p_link: "/standing?view=actions", p_group_key: "discipline-proposed" });
    revalidatePath("/standing");
  });
  if (res?.ok) redirect("/standing?view=actions");
  return res;
}

export async function decideAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("discipline.approve");
    const status = req(fd, "status");
    if (!["approved", "active", "rejected", "resolved", "overturned"].includes(status)) throw new UserError("Invalid decision.");
    check(await s.supabase.from("disciplinary_actions").update({
      status, resolution: str(fd, "resolution"), appeal_outcome: str(fd, "appeal_outcome"), review_date: str(fd, "review_date") ?? undefined,
    }).eq("id", req(fd, "id")));
    revalidatePath("/standing");
    return `Action marked ${status}.`;
  });
}

/**
 * Confirms or dismisses strike suggestions. The suggestions are recalculated on
 * the server, so only strikes the policy actually suggests can be confirmed here.
 * Values are "member_id|trigger_key".
 */
export async function decideSuggestions(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("discipline.propose");
    const op = req(fd, "op");
    if (op !== "confirm" && op !== "dismiss") throw new UserError("Invalid choice.");
    const picked = new Set(fd.getAll("pick").map(String).filter(Boolean));
    if (!picked.size) throw new UserError("Select at least one suggestion.");
    const semesterId = req(fd, "semester_id");
    const semester = (await listSemesters(s.supabase)).find((x) => x.id === semesterId) ?? null;
    if (!semester) throw new UserError("Semester not found.");
    const { result, policy } = await loadStrikeSuggestions(s, semester);
    const chosen = (result?.suggestions ?? []).filter((x) => picked.has(`${x.member_id}|${x.trigger_key}`));
    if (!chosen.length) throw new UserError("Those suggestions no longer apply. Refresh the page.");
    if (op === "confirm") {
      check(await s.supabase.from("strike_records").insert(chosen.map((x) => ({
        member_id: x.member_id, semester_id: semester.id, policy_id: policy?.id ?? null, points: x.points,
        reason: x.reason, source: "policy_suggestion", trigger_key: x.trigger_key, event_id: x.event_id,
      }))));
    } else {
      const reason = req(fd, "reason", "Reason for dismissing");
      if (reason.length < 5) throw new UserError("Give a reason of at least 5 characters.");
      check(await s.supabase.from("strike_dismissals").insert(chosen.map((x) => ({
        member_id: x.member_id, semester_id: semester.id, trigger_key: x.trigger_key, reason,
      }))));
    }
    revalidatePath("/standing");
    for (const x of chosen) revalidatePath(`/members/${x.member_id}`);
    return op === "confirm"
      ? `${chosen.length} strike${chosen.length === 1 ? "" : "s"} recorded.${policy?.status === "approved" ? "" : " The strike policy is a DRAFT: this is tracking only and triggers no action."}`
      : `${chosen.length} suggestion${chosen.length === 1 ? "" : "s"} dismissed. They won't be suggested again.`;
  });
}
