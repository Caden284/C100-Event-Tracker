"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { restoreBackup, verifyBackup, type BackupFile } from "@/lib/backup";

async function readBackup(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new UserError("Choose a backup file.");
  if (file.size > 60 * 1024 * 1024) throw new UserError("Backup file is too large.");
  try {
    return JSON.parse(await file.text()) as BackupFile;
  } catch {
    throw new UserError("The file is not valid JSON.");
  }
}

export async function verifyBackupAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    await assertPermission("backup.manage");
    const v = verifyBackup(await readBackup(fd));
    if (!v.ok) throw new UserError(`Verification FAILED: ${v.problems.slice(0, 6).join(" ")}`);
    const total = Object.values(v.counts).reduce((a, b) => a + b, 0);
    return `Verified ✓ — created ${v.createdAt ? new Date(v.createdAt).toLocaleString("en-US") : "?"}, ${total.toLocaleString()} rows across ${Object.keys(v.counts).length} tables, all checksums match.`;
  });
}

export async function restoreBackupAction(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("backup.manage");
    if (!s.isSuperAdmin) throw new UserError("Only a super administrator can restore a backup.");
    if (str(fd, "confirm_text") !== "RESTORE") throw new UserError("Type RESTORE to confirm.");
    const restored = await restoreBackup(createAdminClient(), await readBackup(fd));
    await s.supabase.rpc("log_audit", { p_action: "backup.restore", p_reason: str(fd, "reason") ?? undefined, p_metadata: restored as never });
    revalidatePath("/", "layout");
    return `Restore complete (merge). ${Object.values(restored).reduce((a, b) => a + b, 0).toLocaleString()} rows written. Nothing was deleted.`;
  });
}
