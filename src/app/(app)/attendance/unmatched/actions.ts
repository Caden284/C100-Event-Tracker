"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { bool, check, req, run, str } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

export async function resolveScan(_p: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    const s = await assertPermission("unmatched.resolve");
    const action = req(fd, "action");
    const data = check(await s.supabase.rpc("resolve_unmatched_scan", {
      p_scan: req(fd, "scan_id"),
      p_action: action,
      p_person: str(fd, "person_id") ?? undefined,
      p_event: str(fd, "event_id") ?? undefined,
      p_note: str(fd, "note") ?? undefined,
      p_new: { first_name: str(fd, "first_name"), last_name: str(fd, "last_name"), email: str(fd, "email"), status_key: str(fd, "status_key") } as never,
      p_add_email: bool(fd, "add_email"),
    })) as { status: string; already_recorded?: boolean };
    revalidatePath("/attendance/unmatched"); revalidatePath("/", "layout");
    return data.already_recorded ? "Resolved — that person already had a record for this event, so nothing was double-counted." : "Resolved.";
  });
  if (res?.ok) redirect("/attendance/unmatched?resolved=1");
  return res;
}

export async function assignScan(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("unmatched.resolve");
    check(await s.supabase.from("unmatched_scans").update({ assigned_to: str(fd, "assigned_to") }).eq("id", req(fd, "scan_id")));
    revalidatePath("/attendance/unmatched");
    return "Reviewer assigned.";
  });
}
