"use server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { check, run, str } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";

export async function markRead(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission();
    const id = str(fd, "id");
    let q = s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", s.userId).is("read_at", null);
    if (id) q = q.eq("id", id);
    check(await q);
    revalidatePath("/", "layout");
    return "Marked as read.";
  });
}
