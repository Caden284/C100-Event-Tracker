import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import { PageHeader, EmptyState, Callout } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { hrefWith, pageOf, sp } from "@/lib/url";
import { REASONS } from "./reasons";

export const metadata = { title: "Unmatched scans" };

export default async function UnmatchedPage({ searchParams }: PageProps<"/attendance/unmatched">) {
  const params = await searchParams;
  const s = await requirePermission("attendance.read");
  const status = sp(params, "status") ?? "open";
  const reason = sp(params, "reason");
  const page = pageOf(params);
  let q = s.supabase.from("unmatched_scans").select("id, first_name, last_name, email, card_id, pin_event_name, event_date, reason, details, suggestions, resolution_status, resolution_note, created_at, events(name), attendance_imports(file_name), assignee:profiles!unmatched_scans_assigned_to_fkey(full_name, email)", { count: "exact" });
  if (status !== "all") q = status === "open" ? q.eq("resolution_status", "open") : q.neq("resolution_status", "open");
  if (reason) q = q.eq("reason", reason);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  if (error) throw error;
  return (
    <>
      <PageHeader title="Unmatched scans" back={{ href: "/attendance", label: "Attendance" }}
        description="Scans that could not be confidently matched to a person or event. Nothing here counts toward anyone until an officer resolves it." />
      {params.resolved ? <Callout tone="info" className="mb-4">Scan resolved.</Callout> : null}
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <label className="sr-only" htmlFor="us">Status</label>
          <Select id="us" name="status" defaultValue={status} className="h-8 w-36 text-xs"><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></Select>
          <label className="sr-only" htmlFor="ur">Reason</label>
          <Select id="ur" name="reason" defaultValue={reason ?? ""} className="h-8 w-56 text-xs"><option value="">All reasons</option>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium">Apply</button>
        </form>
        {(data ?? []).length === 0 ? <EmptyState title={status === "open" ? "Nothing to review 🎉" : "No scans"}>Every scan has been matched or resolved.</EmptyState> : (
          <Table>
            <THead><tr><TH>Name & email</TH><TH>Event</TH><TH>Reason</TH><TH>Suggestions</TH><TH>Source</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {(data ?? []).map((u) => {
                const sugg = (u.suggestions as { name: string; type: string }[]) ?? [];
                const assignee = u.assignee as { full_name: string | null; email: string } | null;
                return (
                  <TR key={u.id}>
                    <TD><span className="font-medium text-ink">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</span><span className="block text-xs text-slate-500">{u.email ?? "no email"}{u.card_id ? ` · ${u.card_id}` : ""}</span></TD>
                    <TD className="text-xs">{(u.events as { name: string } | null)?.name ?? u.pin_event_name ?? "—"}<span className="block text-slate-400">{formatDate(u.event_date)}</span></TD>
                    <TD><Badge tone="amber">{REASONS[u.reason] ?? u.reason}</Badge>{u.details ? <span className="mt-0.5 block max-w-64 text-xs text-slate-500">{u.details}</span> : null}</TD>
                    <TD className="text-xs text-slate-600">{sugg.slice(0, 3).map((x) => `${x.name} (${x.type})`).join(", ") || "—"}</TD>
                    <TD className="text-xs text-slate-500">{(u.attendance_imports as { file_name: string } | null)?.file_name ?? "workbook"}{assignee ? <span className="block">Reviewer: {assignee.full_name ?? assignee.email}</span> : null}</TD>
                    <TD><Badge tone={u.resolution_status === "open" ? "amber" : "green"}>{u.resolution_status.replace("_", " ")}</Badge></TD>
                    <TD className="text-right">{u.resolution_status === "open" && s.can("unmatched.resolve") ? <Link href={`/attendance/unmatched/${u.id}`} className="text-xs font-medium text-brand hover:underline">Review →</Link> : u.resolution_note ? <span className="text-xs text-slate-400">{u.resolution_note}</span> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={50} total={count ?? 0} href={(p) => hrefWith("/attendance/unmatched", params, { page: p })} />
      </Card>
    </>
  );
}
