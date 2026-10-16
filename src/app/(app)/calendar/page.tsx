import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { fetchAll } from "@/lib/data/fetch-all";
import { addDays, todayIso } from "@/lib/domain/dates";
import { PageHeader, Callout } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { sp } from "@/lib/url";
import { CalendarBoard, type CalEvent } from "./board";

export const metadata = { title: "Calendar" };

function monthGrid(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((startDow + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => addDays(first, i - startDow));
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const s = await requirePermission("events.read");
  const { current } = await resolveSemester(s.supabase);
  const today = todayIso();
  const defaultMonth = current && (today < current.start_date || today > current.end_date) ? current.start_date.slice(0, 7) : today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp(params, "month") ?? "") ? sp(params, "month")! : defaultMonth;
  const category = sp(params, "category");
  const hideStudy = sp(params, "study") === "hide";
  const days = monthGrid(month);

  const [{ data: inRange }, { data: tbd }, { data: cats }] = await Promise.all([
    s.supabase.from("events").select("id, name, event_date, start_time, end_time, time_note, location, category_key, planning_status, notes, series_key")
      .gte("event_date", days[0]).lte("event_date", days[days.length - 1]).is("archived_at", null),
    current
      ? s.supabase.from("events").select("id, name, event_date, start_time, end_time, time_note, location, category_key, planning_status, notes, series_key")
          .is("event_date", null).eq("semester_id", current.id).is("archived_at", null)
      : Promise.resolve({ data: [] }),
    s.supabase.from("event_categories").select("key, name").order("sort_order"),
  ]);
  const evs = [...(inRange ?? []), ...(tbd ?? [])].filter((e) => (!category || e.category_key === category) && !(hideStudy && e.category_key === "study"));
  const ids = evs.map((e) => e.id);
  const counts = new Map<string, { attended: number; members: number }>();
  if (ids.length && s.can("attendance.read")) {
    const rows = await fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("event_id, counts_as_attended, member_id").in("event_id", ids).order("id").range(from, to));
    for (const r of rows) {
      if (!r.counts_as_attended) continue;
      const c = counts.get(r.event_id!) ?? { attended: 0, members: 0 };
      c.attended += 1;
      if (r.member_id) c.members += 1;
      counts.set(r.event_id!, c);
    }
  }
  const catName = new Map((cats ?? []).map((c) => [c.key, c.name]));
  const data: CalEvent[] = evs.map((e) => ({ ...e, category_name: e.category_key ? catName.get(e.category_key) ?? null : null, attended: counts.get(e.id)?.attended ?? 0, members: counts.get(e.id)?.members ?? 0 }));
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const canEdit = s.can("events.write");
  const q = (m: string) => `/calendar?month=${m}${category ? `&category=${category}` : ""}${hideStudy ? "&study=hide" : ""}`;

  return (
    <>
      <PageHeader
        title="Chapter calendar"
        description={canEdit ? "Drag an event by its handle to another day to reschedule it (on a phone, tap the event and use “Move to date”). Changes save immediately and are recorded in the audit log." : "Read-only view of the chapter's events. Ask the Secretary or President to reschedule events."}
        actions={
          <>
            {canEdit ? <LinkButton href="/events/new" variant="primary">New event</LinkButton> : null}
            <LinkButton href={`/calendar/print?month=${month}`} variant="secondary"><Printer className="h-4 w-4" /> Print</LinkButton>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={q(shiftMonth(month, -1))} className="rounded-md border border-slate-300 bg-white p-1.5 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
          <h2 className="min-w-44 text-center text-lg font-semibold text-ink">{label}</h2>
          <Link href={q(shiftMonth(month, 1))} className="rounded-md border border-slate-300 bg-white p-1.5 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
          <Link href={q(today.slice(0, 7))} className="ml-1 text-xs font-medium text-brand hover:underline">Today</Link>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <label htmlFor="cal-cat" className="sr-only">Category</label>
          <Select id="cal-cat" name="category" defaultValue={category ?? ""} className="h-8 w-40 text-xs">
            <option value="">All categories</option>
            {(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </Select>
          <label htmlFor="cal-study" className="sr-only">Study blocks</label>
          <Select id="cal-study" name="study" defaultValue={hideStudy ? "hide" : ""} className="h-8 w-40 text-xs">
            <option value="">Show study blocks</option>
            <option value="hide">Hide study blocks</option>
          </Select>
          <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50">Filter</button>
        </form>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-600" aria-label="Legend">
        {[["bg-brand","Meeting"],["bg-violet-500","General"],["bg-emerald-600","Service"],["bg-amber-500","Mentoring"],["bg-slate-400","Study (not counted)"],["bg-rose-500","Recruitment"],["bg-emerald-700","Held · attendance logged"]].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1.5"><span className={`h-3 w-1 ${c}`} />{l}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 border border-dashed border-amber-400" />Pending approval</span>
      </div>
      {!current ? <Callout tone="info" className="mb-3">No semester has been set up yet.</Callout> : null}
      <CalendarBoard key={month + (category ?? "") + hideStudy} initial={data} days={days} month={month} today={today} canEdit={canEdit} />
    </>
  );
}
