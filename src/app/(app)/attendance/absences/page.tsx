import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { loadPolicy } from "@/lib/data/roster";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadAbsenceReasons, loadAbsences } from "@/lib/data/absences";
import { formatDate } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { PageHeader, Callout, EmptyState, StatCard, Tabs } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AbsenceForm } from "@/components/absence-form";
import { sp } from "@/lib/url";

export const metadata = { title: "Absences" };

export default async function AbsencesPage({ searchParams }: PageProps<"/attendance/absences">) {
  const params = await searchParams;
  const s = await requirePermission("attendance.read");
  const show = sp(params, "show") ?? "all";
  const { current } = await resolveSemester(s.supabase);
  if (!current) {
    return (<><PageHeader title="Absences" back={{ href: "/attendance", label: "Attendance" }} /><EmptyState title="No semester selected" /></>);
  }
  const canRecord = s.can("attendance.excuse");
  const [{ rules }, { rows, canSeeReasons }, reasons, events, people] = await Promise.all([
    loadPolicy(s, current),
    loadAbsences(s, current.id),
    loadAbsenceReasons(s, true),
    canRecord ? s.supabase.from("events").select("id, name, event_date").eq("semester_id", current.id).is("archived_at", null).neq("planning_status", "cancelled").not("event_date", "is", null).order("event_date") : Promise.resolve({ data: [] }),
    canRecord
      ? fetchAll((from, to) => s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, member_id, status_key").not("member_id", "is", null).order("last_name").order("person_id").range(from, to))
      : Promise.resolve([]),
  ]);
  const reasonName = new Map(reasons.map((r) => [r.key, r.name]));
  const cap = rules.strikes.max_excused_per_semester;
  const strikeCats = rules.strikes.triggers.unexcused_absence.categories;
  const excused = rows.filter((r) => r.excused);
  const unexcused = rows.filter((r) => !r.excused);
  const list = show === "excused" ? excused : show === "unexcused" ? unexcused : rows;

  // Excuses that count toward the cap: those for events that could earn a strike.
  const capUse = new Map<string, { name: string; member_id: string | null; used: number }>();
  for (const r of excused) {
    if (!r.category_key || !strikeCats.includes(r.category_key)) continue;
    const c = capUse.get(r.person_id) ?? { name: r.name, member_id: r.member_id, used: 0 };
    c.used += 1;
    capUse.set(r.person_id, c);
  }
  const atCap = cap === null ? [] : [...capUse.values()].filter((c) => c.used >= cap).sort((a, b) => b.used - a.used);
  const memberOptions = people
    .filter((p) => !["removed", "graduated"].includes(p.status_key ?? ""))
    .map((p) => ({ id: p.person_id!, label: displayName(p) }));

  return (
    <>
      <PageHeader title="Absences" back={{ href: "/attendance", label: "Attendance" }}
        description={`${current.name} · Excused absences (illness, work, class, a mental health day…) and unexcused absences recorded by officers.`} />
      <Callout tone="info" className="mb-4" title="How excused absences work">
        An excused absence <strong>does not count as attending</strong> and doesn&apos;t lower any requirement. It protects the member from a strike for that event
        {cap === null ? "." : <>, up to <strong>{cap}</strong> excused absence{cap === 1 ? "" : "s"} per semester for events that can earn a strike ({strikeCats.join(", ") || "none"}).</>}
        {" "}Set the limit in the semester&apos;s membership policy.
        {!canSeeReasons ? " Reasons are visible only to officers who record excuses." : ""}
      </Callout>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Excused" value={excused.length} />
        <StatCard label="Unexcused (recorded)" value={unexcused.length} />
        <StatCard label={cap === null ? "Excuse limit" : `At the limit (${cap})`} value={cap === null ? "None" : atCap.length} tone={atCap.length ? "warn" : "default"} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recorded absences" />
          <div className="px-4 pt-3"><Tabs current={show} tabs={[
            { key: "all", label: "All", href: "/attendance/absences", count: rows.length },
            { key: "excused", label: "Excused", href: "/attendance/absences?show=excused", count: excused.length },
            { key: "unexcused", label: "Unexcused", href: "/attendance/absences?show=unexcused", count: unexcused.length },
          ]} /></div>
          {list.length === 0 ? <EmptyState title="No absences recorded">{canRecord ? "Use the form to record one." : null}</EmptyState> : (
            <Table>
              <THead><tr><TH>Date</TH><TH>Event</TH><TH>Member</TH><TH>Absence</TH>{canSeeReasons ? <TH>Reason</TH> : null}</tr></THead>
              <TBody>{list.map((r) => (
                <TR key={r.record_id}>
                  <TD className="whitespace-nowrap">{formatDate(r.event_date)}</TD>
                  <TD><Link href={`/events/${r.event_id}`} className="font-medium text-ink hover:text-brand">{r.event_name}</Link>{r.category_key ? <Badge tone={CATEGORY_TONES[r.category_key]} className="ml-1">{r.category_key}</Badge> : null}</TD>
                  <TD>{r.member_id ? <Link href={`/members/${r.member_id}`} className="hover:text-brand">{r.name}</Link> : r.name}</TD>
                  <TD><Badge tone={r.excused ? "blue" : "amber"}>{r.excused ? "Excused" : "Unexcused"}</Badge></TD>
                  {canSeeReasons ? <TD className="text-xs">{r.excused ? (reasonName.get(r.reason_key ?? "") ?? "—") : "—"}{r.note ? <span className="block text-slate-500">{r.note}</span> : null}</TD> : null}
                </TR>
              ))}</TBody>
            </Table>
          )}
        </Card>
        <div className="min-w-0 space-y-4">
          {canRecord ? (
            <Card>
              <CardHeader title="Record an absence" description="The member tells an officer; the officer records it here. You can record it before or after the event." />
              <CardBody><AbsenceForm reasons={reasons.filter((r) => r.is_active)} events={events.data ?? []} members={memberOptions} /></CardBody>
            </Card>
          ) : null}
          {cap !== null ? (
            <Card>
              <CardHeader title="At or over the excuse limit" description={`Excuses past the first ${cap} no longer protect from strikes.`} />
              {atCap.length === 0 ? <CardBody><p className="text-sm text-slate-500">No one yet.</p></CardBody> : (
                <Table>
                  <THead><tr><TH>Member</TH><TH className="text-right">Used</TH></tr></THead>
                  <TBody>{atCap.map((c) => (
                    <TR key={c.name + c.member_id}><TD>{c.member_id ? <Link href={`/members/${c.member_id}`} className="hover:text-brand">{c.name}</Link> : c.name}</TD>
                      <TD className="text-right"><Badge tone={c.used > cap ? "red" : "amber"}>{c.used} of {cap}</Badge></TD></TR>
                  ))}</TBody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
