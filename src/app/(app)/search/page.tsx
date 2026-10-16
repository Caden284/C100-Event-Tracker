import Link from "next/link";
import { requireOfficer } from "@/lib/auth";
import { displayName } from "@/lib/domain/normalize";
import { formatDate } from "@/lib/domain/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const s = await requireOfficer();
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);
  const like = `%${q.replace(/[^a-zA-Z0-9@.\-' ]/g, " ").trim()}%`;
  const [people, events] = q.length >= 2 ? await Promise.all([
    s.can("members.read") || s.can("prospects.read")
      ? s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, email, member_id, prospect_id, status_key").or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},display_name.ilike.${like}`).limit(40)
      : Promise.resolve({ data: [] }),
    s.can("events.read") ? s.supabase.from("events").select("id, name, event_date").ilike("name", like).limit(20) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  return (
    <>
      <PageHeader title="Search" />
      <form className="mb-4 flex gap-2" role="search"><Input name="q" defaultValue={q} placeholder="Name, email or event" autoFocus aria-label="Search" /><button className="rounded-md bg-brand px-4 text-sm font-medium text-white">Search</button></form>
      {q.length < 2 ? <p className="text-sm text-slate-500">Type at least two characters.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title={`People (${(people.data ?? []).length})`} />
            {(people.data ?? []).length === 0 ? <EmptyState title="No people found" /> : <ul className="divide-y divide-slate-100">{(people.data ?? []).map((p) => (
              <li key={p.person_id}><Link href={p.member_id ? `/members/${p.member_id}` : `/prospects/${p.prospect_id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-50"><span><span className="text-sm font-medium">{displayName(p)}</span><span className="block text-xs text-slate-500">{p.email ?? "no email"}</span></span><Badge tone={p.member_id ? "blue" : "gold"}>{p.member_id ? p.status_key : "prospect"}</Badge></Link></li>))}</ul>}
          </Card>
          <Card><CardHeader title={`Events (${(events.data ?? []).length})`} />
            {(events.data ?? []).length === 0 ? <EmptyState title="No events found" /> : <ul className="divide-y divide-slate-100">{(events.data ?? []).map((e) => <li key={e.id}><Link href={`/events/${e.id}`} className="block px-5 py-2.5 text-sm hover:bg-slate-50">{e.name} <span className="text-xs text-slate-500">{formatDate(e.event_date)}</span></Link></li>)}</ul>}
          </Card>
        </div>
      )}
    </>
  );
}
