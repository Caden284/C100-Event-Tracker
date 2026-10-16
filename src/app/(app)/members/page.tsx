import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { loadStanding } from "@/lib/data/roster";
import { PageHeader, EmptyState, Callout } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, SortTH } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StandingBadge, StatusBadge } from "@/components/standing-badge";
import { hrefWith, pageOf, sp } from "@/lib/url";
import { bulkStatus } from "./actions";

export const metadata = { title: "Members" };
const PAGE = 50;

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const params = await searchParams;
  const s = await requirePermission("members.read");
  const { current } = await resolveSemester(s.supabase);
  const [{ policy, rules, members }, { data: statuses }] = await Promise.all([
    loadStanding(s, current),
    s.supabase.from("member_statuses").select("key, name").eq("is_active", true).order("sort_order"),
  ]);
  const q = sp(params, "q")?.toLowerCase();
  const status = sp(params, "status");
  const standing = sp(params, "standing");
  const committee = sp(params, "committee");
  const role = sp(params, "role");
  const dues = sp(params, "dues");
  const min = sp(params, "min"), max = sp(params, "max"), pct = sp(params, "pct");
  const sort = sp(params, "sort") ?? "name";
  const dir = sp(params, "dir") ?? "asc";

  let list = members.filter((m) => {
    if (q && !`${m.name} ${m.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (status === "former") { if (!["inactive", "graduated", "removed"].includes(m.status_key)) return false; }
    else if (status && m.status_key !== status) return false;
    if (standing === "attention" ? !m.progress.needsAttention : standing === "standout" ? !m.progress.isStandout : standing && m.progress.standing !== standing) return false;
    if (committee && (m.committee ?? "").toLowerCase() !== committee.toLowerCase()) return false;
    if (role === "eboard" && !m.eboard_role) return false;
    if (role === "general" && m.eboard_role) return false;
    if (dues && s.can("dues.read")) { if (dues === "outstanding" ? m.dues?.ok || m.status_key !== "active" : !m.dues?.ok) return false; }
    if (min && m.progress.totalCounted < Number(min)) return false;
    if (max && m.progress.totalCounted > Number(max)) return false;
    if (pct) { const [lo, hi] = pct.split("-").map(Number); if (m.progress.percentComplete < lo || m.progress.percentComplete > hi) return false; }
    if (m.progress.standing === "not_tracked" && (min || max || pct)) return false;
    return true;
  });
  const mul = dir === "desc" ? -1 : 1;
  list = [...list].sort((a, b) => mul * (sort === "total" ? a.progress.totalCounted - b.progress.totalCounted : sort === "pct" ? a.progress.percentComplete - b.progress.percentComplete : (a.last_name ?? a.first_name ?? "").localeCompare(b.last_name ?? b.first_name ?? "")));
  const page = pageOf(params);
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const committees = [...new Set(members.map((m) => m.committee).filter(Boolean) as string[])].sort();
  const sortHref = (k: string, d: string) => hrefWith("/members", params, { sort: k, dir: d });
  const canBulk = s.can("members.write");

  return (
    <>
      <PageHeader title="Members" description={`${list.length} of ${members.length} members · progress for ${current?.name ?? "no semester"} (${policy ? (policy.status === "approved" ? "approved policy" : "DRAFT policy") : "no policy"})`}
        actions={<>
          {s.can("reports.export") ? <LinkButton href={`/api/reports/roster?format=csv`}>Export roster</LinkButton> : null}
          {canBulk ? <LinkButton href="/members/new" variant="primary">Add member</LinkButton> : null}
        </>} />
      {standing === "no_email" ? <Callout tone="warning" className="mb-4" title="Missing-email report">These members cannot be matched to PIN scans until an email is added. Their zeros are a data gap, not proof of absence.</Callout> : null}
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3" role="search">
          <label className="sr-only" htmlFor="mq">Search</label>
          <Input id="mq" name="q" defaultValue={sp(params, "q")} placeholder="Name or email" className="h-8 w-48 text-xs" />
          <label className="sr-only" htmlFor="ms">Status</label>
          <Select id="ms" name="status" defaultValue={status ?? ""} className="h-8 w-36 text-xs">
            <option value="">All statuses</option>{(statuses ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}<option value="former">Inactive/Graduated/Removed</option>
          </Select>
          <label className="sr-only" htmlFor="mst">Standing</label>
          <Select id="mst" name="standing" defaultValue={standing ?? ""} className="h-8 w-40 text-xs">
            <option value="">Any calculated standing</option><option value="good_standing">Good Standing</option><option value="in_progress">In Progress</option>
            <option value="no_email">No email</option><option value="attention">Needs attention</option><option value="standout">Standout</option><option value="not_tracked">Not tracked</option>
          </Select>
          <label className="sr-only" htmlFor="mc">Committee</label>
          <Select id="mc" name="committee" defaultValue={committee ?? ""} className="h-8 w-36 text-xs">
            <option value="">Any committee</option>{committees.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <label className="sr-only" htmlFor="mr">Role</label>
          <Select id="mr" name="role" defaultValue={role ?? ""} className="h-8 w-32 text-xs"><option value="">Any role</option><option value="eboard">E-Board</option><option value="general">General body</option></Select>
          {s.can("dues.read") ? (<><label className="sr-only" htmlFor="md">Dues</label><Select id="md" name="dues" defaultValue={dues ?? ""} className="h-8 w-32 text-xs"><option value="">Any dues</option><option value="paid">Paid/waived</option><option value="outstanding">Outstanding</option></Select></>) : null}
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50">Apply</button>
          <Link href="/members" className="text-xs text-slate-500 hover:underline">Reset</Link>
        </form>
        {shown.length === 0 ? <EmptyState title="No members match these filters" /> : (
          <ActionForm action={bulkStatus} confirm={canBulk ? { title: "Change status for the selected members?", body: "Each member's history records the change and your reason. Attendance history is never deleted.", confirmLabel: "Update status" } : undefined}>
            <Table>
              <THead><tr>
                {canBulk ? <TH className="w-8"><span className="sr-only">Select</span></TH> : null}
                <SortTH label="Member" sortKey="name" current={sort} dir={dir} href={sortHref} />
                <TH>Status</TH>
                {rules.requirements.map((r) => <TH key={r.key} className="text-right" title={r.label}>{r.label.split(" ")[0]} <span className="font-normal normal-case text-slate-400">/{r.required}</span></TH>)}
                <SortTH label="Total" sortKey="total" current={sort} dir={dir} href={sortHref} className="text-right" />
                <SortTH label="Progress" sortKey="pct" current={sort} dir={dir} href={sortHref} />
                <TH>Calculated standing</TH>
              </tr></THead>
              <TBody>
                {shown.map((m) => (
                  <TR key={m.member_id}>
                    {canBulk ? <TD><input type="checkbox" name="member_id" value={m.member_id} aria-label={`Select ${m.name}`} className="h-4 w-4" /></TD> : null}
                    <TD><Link href={`/members/${m.member_id}`} className="font-medium text-ink hover:text-brand">{m.name}</Link>
                      <span className="block text-xs text-slate-500">{m.email ?? <span className="text-amber-700">no email</span>}{m.eboard_role ? ` · ${m.eboard_role}` : ""}{m.committee ? ` · ${m.committee}` : ""}</span></TD>
                    <TD><StatusBadge status={m.status_key} /></TD>
                    {m.progress.requirements.map((r) => <TD key={r.key} className={`tabular text-right ${r.met ? "font-semibold text-emerald-700" : ""}`}>{r.attended}</TD>)}
                    <TD className="tabular text-right font-medium">{m.progress.totalCounted}</TD>
                    <TD className="w-28"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${m.progress.percentComplete}%` }} /></div><span className="tabular text-xs text-slate-500">{m.progress.percentComplete}%</span></div></TD>
                    <TD><StandingBadge p={m.progress} draft={policy?.status !== "approved"} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {canBulk ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-3">
                <span className="text-xs font-medium text-slate-600">Bulk action for ticked members:</span>
                <label className="sr-only" htmlFor="bs">New status</label>
                <Select id="bs" name="bulk_status" className="h-8 w-40 text-xs" defaultValue="">
                  <option value="" disabled>Set status to…</option>{(statuses ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </Select>
                <Input name="bulk_reason" placeholder="Reason (required)" className="h-8 w-64 text-xs" aria-label="Reason" />
                <SubmitButton size="sm" variant="secondary">Apply to selected</SubmitButton>
              </div>
            ) : null}
          </ActionForm>
        )}
        <Pagination page={page} pageSize={PAGE} total={list.length} href={(p) => hrefWith("/members", params, { page: p })} />
      </Card>
    </>
  );
}
