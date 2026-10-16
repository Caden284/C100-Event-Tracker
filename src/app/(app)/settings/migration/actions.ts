"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { friendlyError } from "@/lib/actions";
import { getSetting } from "@/lib/data/settings";
import { parseWorkbook, type ParsedWorkbook } from "@/lib/workbook/parse-workbook";
import { sniffKind } from "@/lib/domain/tabular";

type Preview = Omit<ParsedWorkbook, "payload"> & {
  semester: ParsedWorkbook["payload"]["semester"];
  warnings: ParsedWorkbook["payload"]["warnings"];
  policy: ParsedWorkbook["payload"]["policy"];
  existing: { semesterExists: boolean; previousRuns: number; sameFileRuns: number };
  file: { name: string; sha256: string; size: number };
};

async function readWorkbook(fd: FormData) {
  const s = await assertPermission("data.migrate");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose the workbook file (.xlsx).");
  const limits = await getSetting(s.supabase, "import_limits");
  if (file.size > Math.max(limits.max_file_mb, 10) * 1024 * 1024) throw new Error("The workbook is too large.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (sniffKind(data) !== "xlsx") throw new Error("This is not an .xlsx workbook. Upload C100_Membership_Tracker.xlsx.");
  const parsed = await parseWorkbook(data, file.name.slice(0, 200));
  return { s, parsed, file };
}

export async function previewWorkbook(fd: FormData): Promise<{ ok: true; preview: Preview } | { ok: false; error: string }> {
  try {
    const { s, parsed, file } = await readWorkbook(fd);
    const [{ data: sem }, { data: runs }] = await Promise.all([
      s.supabase.from("semesters").select("id").eq("name", parsed.payload.semester.name).maybeSingle(),
      s.supabase.from("migration_runs").select("file_sha256, status"),
    ]);
    const { payload, ...rest } = parsed;
    return {
      ok: true,
      preview: {
        ...rest,
        semester: payload.semester,
        warnings: payload.warnings,
        policy: payload.policy,
        existing: {
          semesterExists: !!sem,
          previousRuns: (runs ?? []).filter((r) => r.status === "committed").length,
          sameFileRuns: (runs ?? []).filter((r) => r.status === "committed" && r.file_sha256 === payload.file_sha256).length,
        },
        file: { name: file.name, sha256: payload.file_sha256, size: file.size },
      },
    };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export async function commitWorkbook(fd: FormData): Promise<{ ok: true; summary: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    if (fd.get("confirm") !== "on") throw new Error("Tick the confirmation box first.");
    const { s, parsed } = await readWorkbook(fd);
    const sem = parsed.payload.semester;
    const start = String(fd.get("start_date") ?? sem.start_date);
    const end = String(fd.get("end_date") ?? sem.end_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new Error("Check the semester start and end dates.");
    const payload = { ...parsed.payload, semester: { ...sem, start_date: start, end_date: end } };
    const { data, error } = await s.supabase.rpc("commit_workbook_migration", { p: payload as never });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, summary: data as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export async function rollbackMigration(_prev: unknown, fd: FormData) {
  try {
    const s = await assertPermission("data.migrate");
    const { error } = await s.supabase.rpc("rollback_workbook_migration", { p_run: String(fd.get("run_id")), p_reason: String(fd.get("reason") ?? "") });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, message: "Migration rolled back.", at: Date.now() };
  } catch (e) {
    return { ok: false, error: friendlyError(e), at: Date.now() };
  }
}
