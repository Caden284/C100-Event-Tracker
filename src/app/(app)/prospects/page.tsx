import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { loadProspects } from "@/lib/data/prospects";
import { formatDate } from "@/lib/domain/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { hrefWith, pageOf, sp } from "@/lib/url";

export const metadata = { title: "Prospective members" };
const INTEREST = { high: "green", medium: "gold", low: "neutral" } as const;

export default async function ProspectsPage({ searchParams }: PageProps<"/prospects">) {
  const params = await searchParams;
  const s = await requirePermission("prospects.read");
  const all = await loadProspects(s);
  const q = sp(params, "q")?.toLowerCase(), interest = sp(params, "interest"), status = sp(params, "status") ?? "in_recruitment", follow = sp(params, "follow");
  const list = all.filter((p) => (!q || `${p.name} ${p.email ?? ""}`.toLowerCase().includes(q)) && (!interest || p.interest === interest)
    && (status === "all" || p.status === status) && (!follow || p.follow_up_status === follow));
  const page = pageOf(params);
  return (
    <>
      <PageHeader title="Prospective members" description="People going through recruitment (“Perspectives”). Interest levels come from attendance and are indicators — not judgments of commitment."
        actions={s.can("prospects.write") ? <LinkButton href="/prospects/new" variant="primary">Add prospect</LinkButton> : null} />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-slate-100 p-3" role="search">
          <label className="sr-only" htmlFor="pq">Search</label>
          <Input id="pq" name="q" defaultValue={sp(params, "q")} placeholder="Name or email" className="h-8 w-48 text-xs" />
          <label className="sr-only" htmlFor="pi">Interest</label>
          <Select id="pi" name="interest" defaultValue={interest ?? ""} className="h-8 w-36 text-xs"><option value="">Any interest</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
          <label className="sr-only" htmlFor="ps">Status</label>
          <Select id="ps" name="status" defaultValue={status} className="h-8 w-40 text-xs"><option value="in_recruitment">In recruitment</option><option value="converted">Converted</option><option value="withdrawn">Withdrawn</option><option value="not_eligible">Not eligible</option><option value="all">All</option></Select>
          <label className="sr-only" htmlFor="pf">Follow-up</label>
          <Select id="pf" name="follow" defaultValue={follow ?? ""} className="h-8 w-40 text-xs"><option value="">Any follow-up</option><option value="not_contacted">Not contacted</option><option value="contacted">Contacted</option><option value="interested">Interested</option><option value="follow_up_later">Follow up later</option><option value="not_interested">Not interested</option></Select>
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium">Apply</button>
        </form>
        {list.length === 0 ? <EmptyState title="No prospective members match" /> : (
          <Table>
            <THead><tr><TH>Name</TH><TH className="text-right">Events</TH><TH>Interest</TH><TH>First seen</TH><TH>Last seen</TH><TH>Follow-up</TH><TH>Status</TH></tr></THead>
            <TBody>
              {list.slice((page - 1) * 50, page * 50).map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/prospects/${p.id}`} className="font-medium text-ink hover:text-brand">{p.name}</Link><span className="block text-xs text-slate-500">{p.email ?? <span className="text-amber-700">no email</span>}</span></TD>
                  <TD className="tabular text-right">{p.engagement.eventsAttended}{p.recruitmentEvents ? <span className="block text-xs text-slate-400">{p.recruitmentEvents} recruitment</span> : null}</TD>
                  <TD><Badge tone={INTEREST[p.interest]}>{p.interest}{p.interest_override ? " (set)" : ""}</Badge></TD>
                  <TD className="text-xs">{p.first_seen_text ?? (p.engagement.firstSeen ? formatDate(p.engagement.firstSeen) : "—")}</TD>
                  <TD className="text-xs">{p.engagement.lastSeen ? formatDate(p.engagement.lastSeen) : "—"}</TD>
                  <TD className="text-xs">{p.follow_up_status.replace(/_/g, " ")}</TD>
                  <TD><Badge tone={p.status === "converted" ? "blue" : "neutral"}>{p.status.replace("_", " ")}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={50} total={list.length} href={(n) => hrefWith("/prospects", params, { page: n })} />
      </Card>
    </>
  );
}
