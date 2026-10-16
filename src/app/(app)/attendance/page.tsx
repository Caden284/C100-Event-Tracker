import Link from "next/link";
import { CalendarX2, ClipboardPen, FileUp, SearchCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { hrefWith, pageOf } from "@/lib/url";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const params = await searchParams;
  const s = await requirePermission("attendance.read");
  const page = pageOf(params);
  const [{ data: imports, count }, counts] = await Promise.all([
    s.supabase.from("attendance_imports").select("id, file_name, status, row_count, summary, created_at, committed_at, profiles!attendance_imports_created_by_fkey(full_name, email)", { count: "exact" })
      .order("created_at", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
    s.supabase.rpc("open_review_counts"),
  ]);
  const c = (counts.data ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader title="Attendance" description="Import PIN exports, enter paper sign-ins, and resolve scans that could not be matched." />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.can("attendance.import") ? <Link href="/attendance/import" className="flex items-center gap-3 rounded-lg border border-brand bg-brand px-4 py-4 text-white shadow-sm hover:bg-brand-600"><FileUp className="h-6 w-6" /><span><span className="block font-semibold">Import a PIN export</span><span className="text-xs text-brand-100">Upload → map → preview → commit</span></span></Link> : null}
        {s.can("attendance.write") ? <Link href="/attendance/manual" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm hover:border-brand"><ClipboardPen className="h-6 w-6 text-brand" /><span><span className="block font-semibold text-ink">Manual / paper sign-in</span><span className="text-xs text-slate-500">Pick an event, tick names</span></span></Link> : null}
        <Link href="/attendance/unmatched" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm hover:border-brand"><SearchCheck className="h-6 w-6 text-brand" /><span><span className="block font-semibold text-ink">Unmatched scans</span><span className="text-xs text-slate-500">{c.unmatched_open ?? 0} open</span></span></Link>
        <Link href="/attendance/absences" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm hover:border-brand"><CalendarX2 className="h-6 w-6 text-brand" /><span><span className="block font-semibold text-ink">Absences</span><span className="text-xs text-slate-500">Excused &amp; unexcused</span></span></Link>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Imports awaiting review" value={c.imports_in_preview ?? 0} tone={c.imports_in_preview ? "warn" : "default"} />
        <StatCard label="Unmatched scans open" value={c.unmatched_open ?? 0} href="/attendance/unmatched" tone={c.unmatched_open ? "warn" : "default"} />
      </div>
      <Card>
        <CardHeader title="Import history" description="Source file, importing officer and results are kept for every upload." />
        {(imports ?? []).length === 0 ? <EmptyState title="No imports yet" /> : (
          <Table>
            <THead><tr><TH>Uploaded</TH><TH>File</TH><TH>By</TH><TH>Status</TH><TH className="text-right">Rows</TH><TH>Result</TH></tr></THead>
            <TBody>
              {(imports ?? []).map((i) => {
                const sm = i.summary as Record<string, number>;
                const by = i.profiles as { full_name: string | null; email: string } | null;
                return (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap text-xs">{new Date(i.created_at).toLocaleString("en-US")}</TD>
                    <TD><Link href={`/attendance/import/${i.id}`} className="font-medium text-ink hover:text-brand">{i.file_name}</Link></TD>
                    <TD className="text-xs">{by?.full_name ?? by?.email ?? "—"}</TD>
                    <TD><Badge tone={i.status === "committed" ? "green" : i.status === "preview" ? "amber" : "neutral"}>{i.status === "preview" ? "awaiting review" : i.status}</Badge></TD>
                    <TD className="tabular text-right">{i.row_count}</TD>
                    <TD className="text-xs text-slate-600">{i.status === "committed" ? `${sm.inserted ?? 0} recorded · ${sm.duplicates_skipped ?? 0} duplicate · ${sm.queued_for_review ?? 0} to review` : `${sm.new ?? 0} new · ${sm.duplicate ?? 0} duplicate · ${(sm.unmatched ?? 0) + (sm.unmapped_event ?? 0)} need review`}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={25} total={count ?? 0} href={(p) => hrefWith("/attendance", params, { page: p })} />
      </Card>
    </>
  );
}
