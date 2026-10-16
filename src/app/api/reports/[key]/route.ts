import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { REPORTS, renderReport, reportAllowed } from "@/lib/reports";

/** Report download. Permissions are checked per report and per (sensitive) column. Every export is audited. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[key]">) {
  const { key } = await ctx.params;
  const s = await getSession();
  const def = REPORTS.find((r) => r.key === key);
  if (!s?.isOfficer) return new NextResponse("Unauthorized", { status: 401 });
  if (!def) return new NextResponse("Unknown report", { status: 404 });
  if (!reportAllowed(s, def)) return new NextResponse("Forbidden", { status: 403 });
  const url = req.nextUrl;
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const { current, all } = await resolveSemester(s.supabase, url.searchParams.get("semester"));
  if (!current) return new NextResponse("No semester", { status: 400 });
  const wanted = url.searchParams.getAll("col");
  let cols = wanted.length ? def.columns.filter((c) => wanted.includes(c.key)) : def.columns.filter((c) => c.default);
  const includeSensitive = s.can("reports.sensitive");
  cols = cols.filter((c) => !c.sensitive || includeSensitive);
  if (!cols.length) return new NextResponse("Choose at least one column", { status: 400 });
  const rows = await def.load(s, current, all);
  await s.supabase.rpc("log_audit", { p_action: "export.report", p_table: def.key, p_metadata: { format, semester: current.name, columns: cols.map((c) => c.key), rows: rows.length } as never });
  const out = await renderReport(rows, cols, format, def.title);
  const name = `${def.key}-${current.name.replace(/\s+/g, "-")}.${out.ext}`.toLowerCase();
  return new NextResponse(out.body, { headers: { "Content-Type": out.type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
