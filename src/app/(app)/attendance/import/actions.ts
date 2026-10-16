"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, type SessionContext } from "@/lib/auth";
import { bool, check, isUuid, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import { getSetting } from "@/lib/data/settings";
import { resolveSemester } from "@/lib/data/semesters";
import { detectColumns, findHeaderRow, IMPORT_FIELDS, mappingProblems, type ColumnMapping } from "@/lib/domain/columns";
import { buildImportRows } from "@/lib/domain/import-rows";
import { parseFlexibleDate } from "@/lib/domain/dates";
import { FileValidationError, parseTabularFile } from "@/lib/domain/tabular";

type ImportRecord = { id: string; headers: string[]; column_mapping: unknown; status: string; event_resolution: unknown };

/** Re-derives normalized fields for every row from the stored raw cells and the mapping. */
async function rebuildRows(s: SessionContext, imp: ImportRecord, mapping: ColumnMapping, file: { name?: string | null; date?: string | null }) {
  const { data: rows, error } = await s.supabase.from("attendance_import_rows").select("id, row_number, raw").eq("import_id", imp.id).order("row_number").limit(10000);
  if (error) throw error;
  const cells = (rows ?? []).map((r) => ((r.raw as { cells?: string[] }).cells ?? []));
  const built = buildImportRows(imp.headers, cells, mapping, { fileEventName: file.name, fileEventDate: file.date });
  for (let i = 0; i < built.length; i += 200) {
    const chunk = built.slice(i, i + 200).map((b, j) => {
      const { raw: _ignored, ...rest } = b;
      void _ignored;
      return { ...rest, id: rows![i + j].id, import_id: imp.id, raw: rows![i + j].raw, outcome: null, event_id: null, person_id: null, message: null };
    });
    check(await s.supabase.from("attendance_import_rows").upsert(chunk));
  }
}

async function classify(s: SessionContext, importId: string) {
  check(await s.supabase.rpc("classify_attendance_import", { p_import: importId }));
}

export async function uploadImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await run(async () => {
    const s = await assertPermission("attendance.import");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose the PIN export (CSV or Excel).");
    const limits = await getSetting(s.supabase, "import_limits");
    let table;
    try {
      table = await parseTabularFile(new Uint8Array(await file.arrayBuffer()), { maxBytes: limits.max_file_mb * 1024 * 1024, maxRows: limits.max_rows });
    } catch (e) {
      if (e instanceof FileValidationError) throw new UserError(e.message);
      throw e;
    }
    const h = findHeaderRow(table.rows);
    const headers = table.rows[h].map((x, i) => x || `Column ${i + 1}`);
    const data = table.rows.slice(h + 1);
    if (!data.length) throw new UserError("No data rows found under the header row.");
    const { mapping } = detectColumns(headers);
    const presetEvent = str(fd, "event_id");
    const { current } = await resolveSemester(s.supabase);
    const fileName = file.name.replace(/[^\w .()&-]/g, "_").slice(0, 200);
    const imp = check(await s.supabase.from("attendance_imports").insert({
      file_name: fileName, file_sha256: table.sha256, file_size: table.size, file_type: table.kind, sheet_name: table.sheetName,
      headers, row_count: data.length, column_mapping: mapping as never, semester_id: current?.id ?? null,
      default_status_key: mapping.status == null ? "attended" : null,
    }).select("id, headers, column_mapping, status, event_resolution").single());
    const built = buildImportRows(headers, data, mapping);
    for (let i = 0; i < built.length; i += 500) {
      check(await s.supabase.from("attendance_import_rows").insert(
        built.slice(i, i + 500).map((b, j) => ({ ...b, raw: { cells: data[i + j] }, import_id: imp.id })),
      ));
    }
    if (presetEvent && isUuid(presetEvent)) {
      const groups = [...new Set(built.map((b) => b.group_key))];
      const res: Record<string, unknown> = {};
      for (const g of groups) res[g] = { action: "map", event_id: presetEvent, remember: true, pin_event_name: built.find((b) => b.group_key === g)?.pin_event_name ?? null };
      check(await s.supabase.from("attendance_imports").update({ event_resolution: res as never }).eq("id", imp.id));
    }
    await classify(s, imp.id);
    target = `/attendance/import/${imp.id}`;
  });
  if (res?.ok) redirect(target);
  return res;
}

export async function saveMapping(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.import");
    const id = req(fd, "import_id");
    const imp = check(await s.supabase.from("attendance_imports").select("id, headers, column_mapping, status, event_resolution").eq("id", id).single());
    if (imp.status !== "preview") throw new UserError("This import is already finished.");
    const mapping: ColumnMapping = {};
    for (const f of IMPORT_FIELDS) {
      const v = str(fd, `map_${f}`);
      mapping[f] = v === null ? null : Number(v);
      if (mapping[f] !== null && (Number.isNaN(mapping[f]) || mapping[f]! < 0 || mapping[f]! >= imp.headers.length)) throw new UserError("Invalid column.");
    }
    const problems = mappingProblems(mapping);
    if (problems.blocking.length) throw new UserError(problems.blocking.join(" "));
    const defaultStatus = str(fd, "default_status_key");
    if (mapping.status == null && !defaultStatus) throw new UserError("Choose which status every row represents (the file has no status column).");
    const fileEventDate = parseFlexibleDate(str(fd, "file_event_date"));
    check(await s.supabase.from("attendance_imports").update({
      column_mapping: mapping as never, default_status_key: mapping.status == null ? defaultStatus : null,
      event_resolution: {} as never, notes: fileEventDate ? `File event date: ${fileEventDate}` : null,
    }).eq("id", id));
    await rebuildRows(s, imp, mapping, { date: fileEventDate });
    await classify(s, id);
    revalidatePath(`/attendance/import/${id}`);
    return "Column mapping saved. Rows were re-read with the new mapping.";
  });
}

export async function saveEventResolution(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.import");
    const id = req(fd, "import_id");
    const imp = check(await s.supabase.from("attendance_imports").select("status, semester_id").eq("id", id).single());
    if (imp.status !== "preview") throw new UserError("This import is already finished.");
    const resolution: Record<string, unknown> = {};
    const groups = fd.getAll("group").map(String);
    let created = 0;
    for (const g of groups) {
      const choice = str(fd, `choice:${g}`) ?? "auto";
      const pinName = str(fd, `pin:${g}`);
      const remember = bool(fd, `remember:${g}`);
      if (choice === "auto") continue;
      if (choice === "defer") resolution[g] = { action: "defer" };
      else if (choice === "create") {
        if (!s.can("events.write")) throw new UserError("You need permission to create events.");
        const date = str(fd, `date:${g}`);
        const ev = check(await s.supabase.from("events").insert({
          name: str(fd, `newname:${g}`) ?? pinName ?? "Imported event", event_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
          category_key: str(fd, `newcat:${g}`), semester_id: imp.semester_id, planning_status: "confirmed",
          notes: "Created from a PIN import",
        }).select("id").single());
        resolution[g] = { action: "map", event_id: ev.id, remember: true, pin_event_name: pinName };
        created++;
      } else if (choice.startsWith("event:") && isUuid(choice.slice(6))) {
        resolution[g] = { action: "map", event_id: choice.slice(6), remember, pin_event_name: pinName };
      }
    }
    check(await s.supabase.from("attendance_imports").update({ event_resolution: resolution as never }).eq("id", id));
    await classify(s, id);
    revalidatePath(`/attendance/import/${id}`);
    return `Event matching saved${created ? ` (${created} new event(s) created)` : ""}. Preview updated below.`;
  });
}

export async function commitImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("import_id") ?? "");
  const res = await run(async () => {
    const s = await assertPermission("attendance.import");
    const decisions: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("decision:") && (v === "replace" || v === "keep")) decisions[k.slice(9)] = v;
    }
    const complete = bool(fd, "is_complete_roster");
    const reconcile = bool(fd, "reconcile_absent");
    if (reconcile && !complete) throw new UserError("Marking absences requires confirming that the file is a complete roster.");
    check(await s.supabase.from("attendance_imports").update({
      row_decisions: decisions as never, is_complete_roster: complete, reconcile_absent: reconcile,
      create_prospects_for_unmatched: bool(fd, "create_prospects"),
    }).eq("id", id));
    check(await s.supabase.rpc("commit_attendance_import", { p_import: id }));
    revalidatePath("/", "layout");
  });
  if (res?.ok) redirect(`/attendance/import/${id}?done=1`);
  return res;
}

export async function cancelImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    const s = await assertPermission("attendance.import");
    check(await s.supabase.from("attendance_imports").update({ status: "cancelled" }).eq("id", req(fd, "import_id")).eq("status", "preview"));
    revalidatePath("/attendance");
  });
  if (res?.ok) redirect("/attendance");
  return res;
}
