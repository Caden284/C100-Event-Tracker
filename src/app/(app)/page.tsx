import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardList, FileWarning, Inbox, ShieldCheck } from "lucide-react";
import { requireOfficer } from "@/lib/auth";
import { resolveSemester, semesterLabel } from "@/lib/data/semesters";
import { loadStanding } from "@/lib/data/roster";
import { loadProspects } from "@/lib/data/prospects";
import { fetchAll } from "@/lib/data/fetch-all";
import { addDays, formatDate, formatTimeRange } from "@/lib/domain/dates";
import { activeStrikeCount, strikeEligibility } from "@/lib/domain/standing";
import { policyLabel } from "@/lib/domain/policy";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, PageHeader, StatCard } from "@/components/ui/misc";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { AttendanceByEventChart, CategoryChart, DistributionChart, EngagementPie, SemesterComparisonChart, TrendChart } from "@/components/charts";
import { sp } from "@/lib/url";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const s = await requireOfficer();
  const { current, all } = await resolveSemester(s.supabase);
  const categoryFilter = sp(params, "category");
  const statusFilter = sp(params, "status") ?? "active";

  const [{ policy, rules, members, facts, events, today }, prospects, counts, categories, statuses] = await Promise.all([
    loadStanding(s, current),
    loadProspects(s),
    s.supabase.rpc("open_review_counts"),
    s.supabase.from("event_categories").select("key, name").order("sort_order"),
    s.supabase.from("member_statuses").select("key, is_tracked"),
  ]);
  const trackedStatus = new Set((statuses.data ?? []).filter((x) => x.is_tracked).map((x) => x.key));
  const c = (counts.data ?? {}) as Record<string, number>;

  const [strikes, actions, dues, upcoming, allFacts] = await Promise.all([
    s.can("discipline.read") ? s.supabase.from("strike_records").select("member_id, points, voided_at, semester_id") : Promise.resolve({ data: [] }),
    s.can("discipline.read") ? s.supabase.from("disciplinary_actions").select("member_id, action_type, status") : Promise.resolve({ data: [] }),
    s.can("dues.read") && current ? s.supabase.from("member_dues").select("member_id, status").eq("semester_id", current.id) : Promise.resolve({ data: null }),
    s.can("events.read")
      ? s.supabase.from("events").select("id, name, event_date, start_time, end_time, time_note, location, category_key, planning_status")
          .gte("event_date", today).lte("event_date", addDays(today, 14)).is("archived_at", null).neq("planning_status", "cancelled")
          .order("event_date").order("start_time").limit(8)
      : Promise.resolve({ data: [] }),
    s.can("attendance.read")
      ? fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("semester_id, event_id, counts_as_attended").order("id").range(from, to))
      : Promise.resolve([]),
  ]);

  const statusCounts = new Map<string, number>();
  for (const m of members) statusCounts.set(m.status_key, (statusCounts.get(m.status_key) ?? 0) + 1);
  const filtered = members.filter((m) => statusFilter === "all" || m.status_key === statusFilter);
  const tracked = filtered.filter((m) => m.progress.standing !== "not_tracked");
  const good = tracked.filter((m) => m.progress.standing === "good_standing").length;
  const attention = tracked.filter((m) => m.progress.needsAttention).length;
  const standouts = tracked.filter((m) => m.progress.isStandout).length;
  const noEmail = members.filter((m) => !m.email && trackedStatus.has(m.status_key)).length;

  const strikeBy = new Map<string, { points: number; voided_at: string | null; semester_id: string | null }[]>();
  for (const r of (strikes.data ?? []) as { member_id: string; points: number; voided_at: string | null; semester_id: string | null }[]) {
    strikeBy.set(r.member_id, [...(strikeBy.get(r.member_id) ?? []), r]);
  }
  const approaching = members.filter((m) => strikeEligibility(activeStrikeCount(strikeBy.get(m.member_id) ?? [], current?.id), rules, policy?.status ?? null).approaching).length;
  const formal = ((actions.data ?? []) as { status: string; action_type: string }[]).filter((a) => a.status === "approved" || a.status === "active");
  const formalWarnings = formal.filter((a) => a.action_type === "formal_warning").length;
  const formalProbation = formal.filter((a) => a.action_type === "probation").length;

  const inRecruitment = prospects.filter((p) => p.status === "in_recruitment");
  const highInterest = inRecruitment.filter((p) => p.interest === "high").length;

  // ---- charts
  const factsForCharts = facts.filter((f) => f.counts_as_attended && (!categoryFilter || f.category_key === categoryFilter));
  const byEvent = new Map<string, { id: string; name: string; date: string; members: number; prospects: number; other: number; sort: string }>();
  for (const f of factsForCharts) {
    const e = byEvent.get(f.event_id) ?? { id: f.event_id, name: f.event_name, date: f.event_date ? formatDate(f.event_date, { month: "short", day: "numeric" }) : "TBD", members: 0, prospects: 0, other: 0, sort: f.event_date ?? "" };
    if (f.member_id) e.members += 1; else if (f.prospect_id) e.prospects += 1; else e.other += 1;
    byEvent.set(f.event_id, e);
  }
  const eventSeries = [...byEvent.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  const totals = eventSeries.map((e) => e.members + e.prospects + e.other);
  const trend = eventSeries.map((e, i) => ({
    date: e.date, attended: totals[i], cumulative: totals.slice(0, i + 1).reduce((a, b) => a + b, 0),
  }));
  const catNames = new Map((categories.data ?? []).map((x) => [x.key, x.name]));
  const catAgg = new Map<string, { key: string; name: string; attended: number; events: Set<string> }>();
  for (const f of facts.filter((x) => x.counts_as_attended)) {
    const k = f.category_key ?? "uncategorized";
    const a = catAgg.get(k) ?? { key: k, name: catNames.get(k) ?? "Uncategorized", attended: 0, events: new Set() };
    a.attended += 1;
    a.events.add(f.event_id);
    catAgg.set(k, a);
  }
  const categoryData = [...catAgg.values()].map((a) => ({ key: a.key, name: a.name, attended: a.attended, events: a.events.size })).sort((a, b) => b.attended - a.attended);

  const buckets = [
    { bucket: "0", min: 0, max: 0 }, { bucket: "1–2", min: 1, max: 2 }, { bucket: "3–5", min: 3, max: 5 },
    { bucket: "6–10", min: 6, max: 10 }, { bucket: "11–16", min: 11, max: 16 }, { bucket: "17+", min: 17, max: 999 },
  ];
  const distribution = buckets.map((b) => ({ bucket: b.bucket, filter: `min=${b.min}&max=${b.max}`, count: tracked.filter((m) => m.progress.totalCounted >= b.min && m.progress.totalCounted <= b.max).length }));
  const completion = [
    { bucket: "0–24%", filter: "pct=0-24" }, { bucket: "25–49%", filter: "pct=25-49" }, { bucket: "50–74%", filter: "pct=50-74" },
    { bucket: "75–99%", filter: "pct=75-99" }, { bucket: "100%", filter: "pct=100-100" },
  ].map((b) => {
    const [lo, hi] = b.filter.slice(4).split("-").map(Number);
    return { ...b, count: tracked.filter((m) => m.progress.percentComplete >= lo && m.progress.percentComplete <= hi).length };
  });
  const engagement = [
    { key: "high", name: "High (3+)", value: inRecruitment.filter((p) => p.interest === "high").length },
    { key: "medium", name: "Medium (2)", value: inRecruitment.filter((p) => p.interest === "medium").length },
    { key: "low", name: "Low (0–1)", value: inRecruitment.filter((p) => p.interest === "low").length },
  ];
  const semAgg = new Map<string, { attended: number; events: Set<string> }>();
  for (const f of allFacts as { semester_id: string | null; event_id: string | null; counts_as_attended: boolean | null }[]) {
    if (!f.semester_id || !f.counts_as_attended) continue;
    const a = semAgg.get(f.semester_id) ?? { attended: 0, events: new Set() };
    a.attended += 1;
    a.events.add(f.event_id!);
    semAgg.set(f.semester_id, a);
  }
  const comparison = [...all].reverse().filter((x) => semAgg.has(x.id)).map((x) => {
    const a = semAgg.get(x.id)!;
    return { name: x.name, events: a.events.size, avgPerEvent: Math.round((a.attended / a.events.size) * 10) / 10 };
  });

  const duesRows = (dues.data ?? null) as { member_id: string; status: string }[] | null;
  const activeIds = new Set(members.filter((m) => m.status_key === "active").map((m) => m.member_id));
  const duesPaid = duesRows ? duesRows.filter((d) => activeIds.has(d.member_id) && (d.status === "paid" || d.status === "waived")).length : 0;

  const pastNoRoster = events.filter((e) => e.event_date && e.event_date < today && e.planning_status !== "cancelled" && !facts.some((f) => f.event_id === e.id) && e.category_key !== "study").length;
  const noCategory = events.filter((e) => !e.category_key).length;

  return (
    <>
      <PageHeader
        back={null}
        title="Dashboard"
        description={`${semesterLabel(current)} · Live from the database${policy ? ` · ${policyLabel(policy)}` : ""}`}
        actions={
          <form className="flex flex-wrap items-center gap-2" aria-label="Dashboard filters">
            <label className="sr-only" htmlFor="f-status">Member status</label>
            <Select id="f-status" name="status" defaultValue={statusFilter} className="h-8 w-40 text-xs">
              <option value="active">Active members</option>
              <option value="not_verified">Not verified</option>
              <option value="all">All statuses</option>
            </Select>
            <label className="sr-only" htmlFor="f-cat">Event category</label>
            <Select id="f-cat" name="category" defaultValue={categoryFilter ?? ""} className="h-8 w-40 text-xs">
              <option value="">All categories</option>
              {(categories.data ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </Select>
            <button className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50">Apply</button>
          </form>
        }
      />

      {!current ? (
        <Callout tone="info" title="No semester yet">
          Start by importing your workbook under <Link className="underline" href="/settings/migration">Settings → Workbook migration</Link>, or create a semester in <Link className="underline" href="/settings/semesters">Settings → Semesters</Link>.
        </Callout>
      ) : null}
      {policy?.status === "draft" ? (
        <Callout tone="draft" className="mb-5" title="Membership standards are a DRAFT — pending executive board approval">
          Progress and calculated standing below use the draft policy “{policy.name} v{policy.version}”. They are calculations, not chapter decisions. Strike thresholds are inactive until approved.
        </Callout>
      ) : null}

      <section aria-labelledby="sec-membership" className="space-y-3">
        <h2 id="sec-membership" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membership</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Active members" value={statusCounts.get("active") ?? 0} href="/members?status=active" hint="Official status" />
          <StatCard label="Not verified" value={statusCounts.get("not_verified") ?? 0} href="/members?status=not_verified" tone={(statusCounts.get("not_verified") ?? 0) ? "warn" : "default"} />
          <StatCard label="Inactive · Graduated · Removed" value={`${statusCounts.get("inactive") ?? 0} · ${statusCounts.get("graduated") ?? 0} · ${statusCounts.get("removed") ?? 0}`} href="/members?status=former" />
          <StatCard label="Meeting all requirements" value={good} href="/members?standing=good_standing" hint={`of ${tracked.length} tracked · calculated`} tone="good" />
          <StatCard label="Needing attention" value={attention} href="/standing?view=attention" hint="System warning" tone={attention ? "warn" : "default"} />
          <StatCard label="Missing email" value={noEmail} href="/members?standing=no_email" hint="Data quality" tone={noEmail ? "warn" : "default"} />
          {s.can("discipline.read") ? (
            <>
              <StatCard label="Approaching strike threshold" value={approaching} href="/standing?view=strikes" hint={policy?.status === "approved" ? "Approved policy" : "Draft policy — informational"} tone={policy?.status === "approved" ? "warn" : "draft"} />
              <StatCard label="Formal warning · probation" value={`${formalWarnings} · ${formalProbation}`} href="/standing?view=actions" hint="Approved decisions only" icon={<ShieldCheck className="h-4 w-4 text-slate-400" />} />
            </>
          ) : null}
          {s.can("dues.read") ? (
            <StatCard label="Dues paid · outstanding" value={`${duesPaid} · ${Math.max(0, activeIds.size - duesPaid)}`} href="/members?dues=outstanding" hint={current?.dues_deadline ? `Deadline ${formatDate(current.dues_deadline)}` : "Active members"} />
          ) : null}
          <StatCard label="Standout (Outstanding GBM candidates)" value={standouts} href="/recognition?tab=candidates" hint="Calculated eligibility" />
        </div>
      </section>

      <section aria-labelledby="sec-recruit" className="mt-6 space-y-3">
        <h2 id="sec-recruit" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recruitment & operations</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Prospective members in recruitment" value={inRecruitment.length} href="/prospects" />
          <StatCard label="High interest (Outstanding Perspective candidates)" value={highInterest} href="/prospects?interest=high" hint="Indicator, not a judgment" />
          <StatCard label="Upcoming events (14 days)" value={(upcoming.data ?? []).length} href="/calendar" icon={<CalendarClock className="h-4 w-4 text-slate-400" />} />
          <StatCard label="Imports awaiting review" value={c.imports_in_preview ?? 0} href="/attendance" tone={c.imports_in_preview ? "warn" : "default"} icon={<Inbox className="h-4 w-4 text-slate-400" />} />
          <StatCard label="Unmatched scans" value={c.unmatched_open ?? 0} href="/attendance/unmatched" tone={c.unmatched_open ? "warn" : "default"} icon={<AlertTriangle className="h-4 w-4 text-slate-400" />} />
          <StatCard label="Past events without attendance" value={pastNoRoster} href="/events?view=needs-roster" tone={pastNoRoster ? "warn" : "default"} icon={<ClipboardList className="h-4 w-4 text-slate-400" />} />
        </div>
      </section>

      {(s.can("attendance.import") || s.can("policies.approve")) && (pastNoRoster || c.unmatched_open || c.imports_in_preview || noEmail || noCategory || c.policies_awaiting_approval) ? (
        <Card className="mt-6">
          <CardHeader title="Needs your attention" description="Tasks generated from the current data" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {c.imports_in_preview ? <li><Link className="text-brand hover:underline" href="/attendance">{c.imports_in_preview} attendance import(s) are waiting to be reviewed and committed</Link></li> : null}
              {c.unmatched_open ? <li><Link className="text-brand hover:underline" href="/attendance/unmatched">{c.unmatched_open} scan(s) could not be matched to a person or event</Link></li> : null}
              {pastNoRoster ? <li><Link className="text-brand hover:underline" href="/events?view=needs-roster">{pastNoRoster} past event(s) have no attendance yet — upload the PIN export or enter paper sign-ins</Link></li> : null}
              {noEmail ? <li><Link className="text-brand hover:underline" href="/members?standing=no_email">{noEmail} member(s) have no email, so their PIN scans cannot be matched</Link></li> : null}
              {noCategory ? <li><Link className="text-brand hover:underline" href="/events?view=no-category">{noCategory} event(s) have no category, so attendance there counts toward nothing</Link></li> : null}
              {s.can("policies.approve") && c.policies_awaiting_approval ? <li><Link className="text-brand hover:underline" href="/settings/policies">{c.policies_awaiting_approval} policy draft(s) are awaiting your approval</Link></li> : null}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance by event" description={`Counted check-ins${categoryFilter ? ` · ${catNames.get(categoryFilter)}` : ""} · click a bar to open the event`} />
          <CardBody><AttendanceByEventChart data={eventSeries} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Upcoming events" actions={<Link href="/calendar" className="text-xs text-brand hover:underline">Calendar</Link>} />
          <CardBody className="p-0">
            {(upcoming.data ?? []).length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">Nothing scheduled in the next two weeks.</p> : (
              <ul className="divide-y divide-slate-100">
                {(upcoming.data ?? []).map((e) => (
                  <li key={e.id} className="px-5 py-3">
                    <Link href={`/events/${e.id}`} className="text-sm font-medium text-ink hover:text-brand">{e.name}</Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {formatDate(e.event_date, { weekday: "short", month: "short", day: "numeric" })} · {formatTimeRange(e.start_time, e.end_time, e.time_note)}
                      {e.category_key ? <Badge tone={CATEGORY_TONES[e.category_key]}>{catNames.get(e.category_key)}</Badge> : null}
                      {e.planning_status === "pending_approval" ? <Badge tone="draft">Pending approval</Badge> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Attendance trend" description="Per event and cumulative" />
          <CardBody><TrendChart data={trend} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Attendance by category" description="Click a bar to see those events" />
          <CardBody><CategoryChart data={categoryData} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Prospective-member engagement" description="Interest indicators from attendance" />
          <CardBody><EngagementPie data={engagement} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Member participation" description="Counted events per tracked member" />
          <CardBody><DistributionChart data={distribution} hrefFor="/members?" label="Members" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Progress toward requirements" description="Share of combined requirement met (calculated)" />
          <CardBody><DistributionChart data={completion} hrefFor="/members?" label="Members" color="#c8a24a" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Semester comparison" description="Average counted attendance per event" />
          <CardBody><SemesterComparisonChart data={comparison} /></CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="How to read status in this hub" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="flex items-center gap-2 font-medium"><Badge tone="green">Active</Badge> Official status</dt><dd className="mt-1 text-slate-600">Recorded by an officer on the member record.</dd></div>
            <div><dt className="flex items-center gap-2 font-medium"><Badge tone="blue">Good Standing</Badge> Calculated</dt><dd className="mt-1 text-slate-600">Computed from attendance and the semester’s policy. Recalculates automatically.</dd></div>
            <div><dt className="flex items-center gap-2 font-medium"><Badge tone="amber">Behind pace</Badge> System warning</dt><dd className="mt-1 text-slate-600">Generated by the app to flag follow-up. Not a disciplinary action.</dd></div>
            <div><dt className="flex items-center gap-2 font-medium"><Badge tone="red"><FileWarning className="h-3 w-3" />Probation</Badge> Approved decision</dt><dd className="mt-1 text-slate-600">Only appears after an authorized officer approves a formal action.</dd></div>
          </dl>
        </CardBody>
      </Card>
    </>
  );
}
