import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportBackup } from "@/lib/backup";

/** Full JSON backup. Permission is checked with the officer's own session BEFORE the privileged client is used. */
export async function GET() {
  const s = await getSession();
  if (!s?.can("backup.manage")) return new NextResponse("Forbidden", { status: 403 });
  const backup = await exportBackup(createAdminClient(), s.userId);
  await s.supabase.rpc("log_audit", { p_action: "backup.download", p_metadata: backup.counts as never });
  const stamp = backup.created_at.slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify(backup), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="c100-hub-backup-${stamp}.backup.json"`, "Cache-Control": "no-store" },
  });
}
