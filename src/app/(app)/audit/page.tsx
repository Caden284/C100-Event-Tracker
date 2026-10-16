import { requirePermission } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { hrefWith, pageOf, sp } from "@/lib/url";

export const metadata = { title: "Audit log" };
const TABLES = ["attendance_records", "attendance_imports", "members", "people", "person_identifiers", "prospective_members", "events", "membership_policies", "disciplinary_actions", "strike_records", "recognition_results", "recognition_nominations", "point_transactions", "user_roles", "role_permissions", "semesters", "unmatched_scans", "migration_runs"];

function summarize(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  return Object.entries(changes as Record<string, unknown>).slice(0, 5).map(([k, v]) => {
    if (v && typeof v === "object" && "to" in (v as object)) return `${k}: ${JSON.stringify((v as { from: unknown }).from)} → ${JSON.stringify((v as { to: unknown }).to)}`;
    return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
  }).join(" · ").slice(0, 300);
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const params = await searchParams;
  const s = await requirePermission("audit.read");
  const page = pageOf(params);
  const table = sp(params, "table"), actor = sp(params, "actor"), action = sp(params, "action"), from = sp(params, "from"), to = sp(params, "to");
  let q = s.supabase.from("audit_logs").select("*", { count: "exact" });
  if (table) q = q.eq("table_name", table);
  if (actor) q = q.eq("actor_id", actor);
  if (action) q = q.ilike("action", `%${action.replace(/[%_]/g, "")}%`);
  if (from) q = q.gte("occurred_at", from);
  if (to) q = q.lte("occurred_at", `${to}T23:59:59`);
  const [{ data, count }, { data: profiles }] = await Promise.all([
    q.order("occurred_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1),
    s.supabase.from("profiles").select("id, full_name, email"),
  ]);
  const who = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  return (
    <>
      <PageHeader title="Audit log" description="Append-only history of significant changes, exports and administrative actions. Nobody can edit or delete entries through the app." />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <label className="sr-only" htmlFor="at">Record type</label>
          <Select id="at" name="table" defaultValue={table ?? ""} className="h-8 w-48 text-xs"><option value="">All record types</option>{TABLES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</Select>
          <label className="sr-only" htmlFor="aa">Officer</label>
          <Select id="aa" name="actor" defaultValue={actor ?? ""} className="h-8 w-44 text-xs"><option value="">Any officer</option>{(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}</Select>
          <Input name="action" defaultValue={action} placeholder="Action contains…" className="h-8 w-40 text-xs" aria-label="Action" />
          <Input name="from" type="date" defaultValue={from} className="h-8 w-36 text-xs" aria-label="From" />
          <Input name="to" type="date" defaultValue={to} className="h-8 w-36 text-xs" aria-label="To" />
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium">Filter</button>
        </form>
        {(data ?? []).length === 0 ? <EmptyState title="No entries" /> : (
          <Table>
            <THead><tr><TH>When</TH><TH>Officer</TH><TH>Action</TH><TH>Record</TH><TH>Reason</TH><TH>Details</TH></tr></THead>
            <TBody>{(data ?? []).map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{new Date(a.occurred_at).toLocaleString("en-US")}</TD>
                <TD className="text-xs">{a.actor_id ? who.get(a.actor_id) ?? a.actor_id.slice(0, 8) : <span className="text-slate-400">system</span>}</TD>
                <TD><Badge tone={a.action === "delete" ? "red" : a.action === "insert" ? "green" : a.action.startsWith("export") ? "purple" : "neutral"}>{a.action}</Badge></TD>
                <TD className="text-xs">{a.table_name?.replace(/_/g, " ")}<span className="block font-mono text-[10px] text-slate-400">{a.record_id?.slice(0, 13)}</span></TD>
                <TD className="max-w-48 text-xs">{a.reason}</TD>
                <TD className="max-w-md text-xs text-slate-500">{summarize(a.changes ?? a.metadata)}</TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={50} total={count ?? 0} href={(p) => hrefWith("/audit", params, { page: p })} />
      </Card>
    </>
  );
}
