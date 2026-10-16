"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { check, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

/** Records an excused or unexcused absence for a member at an event. */
export async function recordAbsence(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.excuse");
    const kind = req(fd, "kind", "Excused or unexcused");
    if (kind !== "excused" && kind !== "unexcused") throw new UserError("Choose excused or unexcused.");
    const eventId = req(fd, "event_id", "Event");
    const personId = req(fd, "person_id", "Member");
    const reason = kind === "excused" ? req(fd, "reason_key", "Reason") : null;
    check(await s.supabase.rpc("record_absence", {
      p_event: eventId, p_person: personId, p_excused: kind === "excused",
      p_reason: reason ?? undefined, p_note: str(fd, "note") ?? undefined,
    }));
    revalidatePath("/attendance/absences"); revalidatePath(`/events/${eventId}`); revalidatePath("/standing");
    const memberId = str(fd, "member_id");
    if (memberId) revalidatePath(`/members/${memberId}`);
    return kind === "excused"
      ? "Excused absence recorded. It doesn't count as attending; it protects the member from a strike for this event."
      : "Unexcused absence recorded.";
  });
}
