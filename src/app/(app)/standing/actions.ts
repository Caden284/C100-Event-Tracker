"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { bool, check, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

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
