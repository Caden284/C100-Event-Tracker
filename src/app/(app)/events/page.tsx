import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { attendanceCountsByEvent, rosterStatus } from "@/lib/data/events";
import { formatDate, formatTimeRange, todayIso } from "@/lib/domain/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, SortTH } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { hrefWith, pageOf, sp } from "@/lib/url";

export const metadata = { title: "Events" };
const PAGE = 50;

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;
  const s = await requirePermission("events.read");
  const { current } = await resolveSemester(s.supabase);
  const today = todayIso();
  const view = sp(params, "view") ?? "all";
  const category = sp(params, "category");
  const q = sp(params, "q");
  const scope = sp(params, "scope") ?? "semester";
  const sort = sp(params, "sort") ?? "date";
  const dir = sp(params, "dir") ?? "asc";

  let query = s.supabase.from("events").select("id, name, event_date, start_time, end_time, time_note, location, category_key, planning_status, archived_at, series_key, semester_id, event_pin_names(pin_name)");
  if (scope === "semester" && current) query = query.eq("semester_id", current.id);
  if (view === "archived") query = query.not("archived_at", "is", null); else query = query.is("archived_at", null);
  if (category) query = query.eq("category_key", category);
  if (view === "no-category") query = query.is("category_key", null);
  if (view === "upcoming") query = query.gte("event_date", today);
  if (view === "past" || view === "needs-roster") query = query.lt("event_date", today);
  if (view === "tbd") query = query.is("event_date", null);
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: rows, error } = await query.order("event_date", { ascending: true, nullsFirst: false }).limit(2000);
  if (error) throw error;
  const counts = await attendanceCountsByEvent(s, (rows ?? []).map((r) => r.id));
  let list = (rows ?? []).map((e) => ({ ...e, c: counts.get(e.id) ?? { attended: 0, members: 0, prospects: 0, records: 0 } }));
  if (view === "needs-roster") list = list.filter((e) => e.c.records === 0 && e.planning_status !== "cancelled" && e.category_key !== "study");
  const mul = dir === "desc" ? -1 : 1;
  list.sort((a, b) => mul * (sort === "name" ? a.name.localeCompare(b.name) : sort === "attended" ? a.c.attended - b.c.attended : (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999")));
  const page = pageOf(params);
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const { data: cats } = await s.supabase.from("event_categories").select("key, name").order("sort_order");
  const catName = new Map((cats ?? []).map((c) => [c.key, c.name]));
  const views = [["all", "All"], ["upcoming", "Upcoming"], ["past", "Past"], ["needs-roster", "Needs roster"], ["tbd", "Date TBD"], ["no-category", "No category"], ["archived", "Archived"]];

  return (
    <>
      <PageHeader title="Events" description={`${scope === "semester" && current ? current.name : "All semesters"} · ${list.length} event(s)`}
        actions={s.can("events.write") ? <>
          <LinkButton href="/events/import">Import calendar</LinkButton>
          <LinkButton href="/events/series">Recurring series</LinkButton>
          <LinkButton href="/events/new" variant="primary">New event</LinkButton>
        </> : null} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {views.map(([k, l]) => (
          <Link key={k} href={hrefWith("/events", params, { view: k === "all" ? null : k, page: null })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${view === k ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>
        ))}
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3">
          {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
          <label className="sr-only" htmlFor="eq">Search</label>
          <Input id="eq" name="q" defaultValue={q} placeholder="Search event name" className="h-8 w-56 text-xs" />
          <label className="sr-only" htmlFor="ec">Category</label>
          <Select id="ec" name="category" defaultValue={category ?? ""} className="h-8 w-40 text-xs">
            <option value="">All categories</option>
            {(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </Select>
          <label className="sr-only" htmlFor="es">Scope</label>
          <Select id="es" name="scope" defaultValue={scope} className="h-8 w-40 text-xs">
            <option value="semester">This semester</option>
            <option value="all">All semesters</option>
          </Select>
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50">Apply</button>
        </form>
        {shown.length === 0 ? <EmptyState title="No events match">Try another filter{s.can("events.write") ? ", or create an event." : "."}</EmptyState> : (
          <Table>
            <THead><tr>
              <SortTH label="Date" sortKey="date" current={sort} dir={dir} href={(k, d) => hrefWith("/events", params, { sort: k, dir: d })} />
              <SortTH label="Event" sortKey="name" current={sort} dir={dir} href={(k, d) => hrefWith("/events", params, { sort: k, dir: d })} />
              <TH>Category</TH><TH>Status</TH>
              <SortTH label="Attended" sortKey="attended" current={sort} dir={dir} href={(k, d) => hrefWith("/events", params, { sort: k, dir: d })} className="text-right" />
              <TH className="hidden lg:table-cell">PIN name</TH>
            </tr></THead>
            <TBody>
              {shown.map((e) => {
                const st = rosterStatus(e, e.c.records, today);
                const pins = (e.event_pin_names ?? []) as { pin_name: string }[];
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap"><span className="tabular">{formatDate(e.event_date, { weekday: "short", month: "short", day: "numeric" })}</span><span className="block text-xs text-slate-400">{formatTimeRange(e.start_time, e.end_time, e.time_note)}</span></TD>
                    <TD><Link href={`/events/${e.id}`} className="font-medium text-ink hover:text-brand">{e.name}</Link>{e.location ? <span className="block text-xs text-slate-500">{e.location}</span> : null}</TD>
                    <TD>{e.category_key ? <Badge tone={CATEGORY_TONES[e.category_key]}>{catName.get(e.category_key) ?? e.category_key}</Badge> : <Badge tone="amber">No category</Badge>}</TD>
                    <TD className="space-x-1 whitespace-nowrap"><Badge tone={st.tone}>{st.label}</Badge>{e.planning_status === "pending_approval" ? <Badge tone="draft">Pending</Badge> : null}{e.planning_status === "confirmed" ? <Badge tone="blue">Confirmed</Badge> : null}</TD>
                    <TD className="tabular text-right">{e.c.attended ? <>{e.c.attended}<span className="block text-xs text-slate-400">{e.c.members} m · {e.c.prospects} p</span></> : "—"}</TD>
                    <TD className="hidden max-w-56 truncate text-xs text-slate-500 lg:table-cell">{pins.map((p) => p.pin_name).join(", ") || <span className="text-slate-300">not mapped</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE} total={list.length} href={(p) => hrefWith("/events", params, { page: p })} />
      </Card>
    </>
  );
}
