import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { toCsv } from "@/lib/domain/csv";

/** CSV of every row in an import with its outcome (imported, skipped, unresolved). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/attendance/import/[id]/report">) {
  const { id } = await ctx.params;
  const s = await getSession();
  if (!s?.can("attendance.read")) return new NextResponse("Forbidden", { status: 403 });
  const { data: imp } = await s.supabase.from("attendance_imports").select("file_name").eq("id", id).maybeSingle();
  if (!imp) return new NextResponse("Not found", { status: 404 });
  const rows = await fetchAll((from, to) => s.supabase.from("attendance_import_rows")
    .select("row_number, first_name, last_name, email, card_id, pin_event_name, event_date, status_raw, person_type, match_method, outcome, message, events(name)")
    .eq("import_id", id).order("row_number").range(from, to));
  const csv = toCsv(rows, [
    { key: "row", label: "Row", value: (r) => r.row_number },
    { key: "first", label: "First name", value: (r) => r.first_name },
    { key: "last", label: "Last name", value: (r) => r.last_name },
    { key: "email", label: "Email", value: (r) => r.email },
    { key: "card", label: "Card ID", value: (r) => r.card_id },
    { key: "pin", label: "PIN event name", value: (r) => r.pin_event_name },
    { key: "event", label: "Matched event", value: (r) => (r.events as { name: string } | null)?.name },
    { key: "date", label: "Event date", value: (r) => r.event_date },
    { key: "status", label: "Status in file", value: (r) => r.status_raw },
    { key: "type", label: "Person type", value: (r) => r.person_type },
    { key: "match", label: "Matched by", value: (r) => r.match_method },
    { key: "outcome", label: "Outcome", value: (r) => r.outcome },
    { key: "message", label: "Details", value: (r) => r.message },
  ]);
  await s.supabase.rpc("log_audit", { p_action: "export.import_report", p_table: "attendance_imports", p_record_id: id });
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-report-${imp.file_name.replace(/[^\w.-]/g, "_")}.csv"`, "Cache-Control": "no-store" },
  });
}
