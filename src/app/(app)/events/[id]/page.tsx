import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { rosterStatus } from "@/lib/data/events";
import { formatDate, formatTimeRange, todayIso } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { PageHeader, Callout, DescList, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addPinName, addWalkIn, correctAttendance, removePinName, setArchived } from "../actions";
import { RosterChecklist, type RosterPerson } from "./roster-checklist";
import { AbsenceForm } from "@/components/absence-form";
import { loadAbsenceReasons } from "@/lib/data/absences";

export const metadata = { title: "Event" };

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const s = await requirePermission("events.read");
  const { data: ev } = await s.supabase.from("events").select("*, semesters(name), event_categories(name)").eq("id", id).maybeSingle();
  if (!ev) notFound();
  const [{ data: pins }, records, { data: statuses }, people] = await Promise.all([
    s.supabase.from("event_pin_names").select("id, pin_name, is_primary, created_at").eq("event_id", id).order("is_primary", { ascending: false }),
    s.can("attendance.read")
      ? fetchAll((from, to) => s.supabase.from("attendance_records").select("id, person_id, status_key, source, source_email, source_marked_by, source_marked_on, change_reason, created_at, updated_at, import_id, people(first_name, last_name, preferred_name)").eq("event_id", id).order("created_at").range(from, to))
      : Promise.resolve([]),
    s.supabase.from("attendance_statuses").select("key, name, counts_as_attended, is_active").order("sort_order"),
    s.can("attendance.write") || s.can("attendance.excuse")
      ? fetchAll((from, to) => s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, email, member_id, status_key, prospect_id, prospect_status").order("last_name").order("person_id").range(from, to))
      : Promise.resolve([]),
  ]);
  const types = new Map(people.map((p) => [p.person_id, p.member_id ? "member" : "prospect"]));
  const statusName = new Map((statuses ?? []).map((x) => [x.key, x.name]));
  const counted = new Set((statuses ?? []).filter((x) => x.counts_as_attended).map((x) => x.key));
  const recBy = new Map(records.map((r) => [r.person_id, r.status_key]));
  const roster: RosterPerson[] = people
    .filter((p) => (p.member_id && !["removed", "graduated"].includes(p.status_key ?? "")) || (p.prospect_id && !p.member_id))
    .map((p) => ({ person_id: p.person_id!, name: displayName(p), email: p.email, type: p.member_id ? "member" : "prospect", recorded: recBy.has(p.person_id!) ? statusName.get(recBy.get(p.person_id!)!) ?? "recorded" : null }));
  const today = todayIso();
  const st = rosterStatus(ev, records.length, today);
  const attended = records.filter((r) => counted.has(r.status_key));
  // "Excused" needs a reason, so it is recorded with the absence form instead.
  const activeStatuses = (statuses ?? []).filter((x) => x.is_active && x.key !== "excused");
  const canExcuse = s.can("attendance.excuse");
  const canSeeReasons = canExcuse || s.can("members.notes");
  const [reasons, excuseRows] = await Promise.all([
    canSeeReasons ? loadAbsenceReasons(s, true) : Promise.resolve([]),
    canSeeReasons && records.some((r) => r.status_key === "excused")
      ? s.supabase.from("absence_excuses").select("attendance_record_id, reason_key, note").in("attendance_record_id", records.filter((r) => r.status_key === "excused").map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);
  const reasonName = new Map(reasons.map((r) => [r.key, r.name]));
  const excuseBy = new Map((excuseRows.data ?? []).map((e) => [e.attendance_record_id, e]));
  const absentCandidates = people
    .filter((p) => p.member_id && !["removed", "graduated"].includes(p.status_key ?? "") && !counted.has(recBy.get(p.person_id!) ?? ""))
    .map((p) => ({ id: p.person_id!, label: `${displayName(p)}${recBy.get(p.person_id!) === "excused" ? " (excused)" : recBy.get(p.person_id!) === "absent" ? " (unexcused)" : ""}` }));
  const excusedCount = records.filter((r) => r.status_key === "excused").length;
  const unexcusedCount = records.filter((r) => r.status_key === "absent").length;
  const cat = ev.event_categories as { name: string } | null;

  return (
    <>
      <PageHeader
        title={ev.name}
        back={{ href: "/events", label: "Events" }}
        badge={<><Badge tone={st.tone}>{st.label}</Badge>{ev.category_key ? <Badge tone={CATEGORY_TONES[ev.category_key]}>{cat?.name}</Badge> : null}</>}
        description={`${formatDate(ev.event_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · ${formatTimeRange(ev.start_time, ev.end_time, ev.time_note)}${ev.location ? ` · ${ev.location}` : ""}`}
        actions={<>
          <LinkButton href={`/events/${id}/print`}><Printer className="h-4 w-4" /> Sign-in sheet</LinkButton>
          {s.can("attendance.import") ? <LinkButton href={`/attendance/import?event=${id}`}>Upload PIN export</LinkButton> : null}
          {s.can("events.write") ? <LinkButton href={`/events/${id}/edit`} variant="primary"><Pencil className="h-4 w-4" /> Edit</LinkButton> : null}
        </>}
      />
      {ev.archived_at ? <Callout tone="warning" className="mb-4" title="Archived">This event is archived; its attendance is excluded from totals.</Callout> : null}
      {!ev.category_key ? <Callout tone="warning" className="mb-4">No category: attendance at this event counts toward no requirement.</Callout> : null}
      {!ev.semester_id ? <Callout tone="warning" className="mb-4">No semester assigned: this event is excluded from semester totals.</Callout> : null}
      {ev.category_key === "recruitment" ? <Callout tone="info" className="mb-4">Recruitment event — tracked for prospective members. Member scans are logged but do not count toward member standards.</Callout> : null}
      {ev.counting_override ? <Callout tone="info" className="mb-4" title="Counting exception">{ev.counting_override === "none" ? "Counts toward no requirement" : `Counts as ${ev.counting_override}`} — {ev.counting_override_reason}</Callout> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Attendance (${attended.length} counted · ${records.length} records)`} description="Imported and manual records appear together; the source column shows where each came from." />
          {records.length === 0 ? <EmptyState title="No attendance yet">Upload the PIN export or use the paper sign-in entry.</EmptyState> : (
            <Table>
              <THead><tr><TH>Person</TH><TH>Type</TH><TH>Status</TH><TH>Source</TH>{s.can("attendance.write") ? <TH className="text-right">Correct</TH> : null}</tr></THead>
              <TBody>
                {records.map((r) => {
                  const p = r.people as { first_name: string | null; last_name: string | null; preferred_name: string | null };
                  const t = types.get(r.person_id);
                  return (
                    <TR key={r.id}>
                      <TD><Link className="font-medium text-ink hover:text-brand" href={`/people/${r.person_id}`}>{displayName(p)}</Link>{r.source_email ? <span className="block text-xs text-slate-400">{r.source_email}</span> : null}</TD>
                      <TD><Badge tone={t === "member" ? "blue" : "gold"}>{t ?? "—"}</Badge></TD>
                      <TD><Badge tone={counted.has(r.status_key) ? "green" : r.status_key === "excused" ? "blue" : r.status_key === "absent" ? "amber" : "neutral"}>{statusName.get(r.status_key) ?? r.status_key}</Badge>
                        {r.status_key === "excused" && canSeeReasons ? <span className="block text-xs text-slate-500">{reasonName.get(excuseBy.get(r.id)?.reason_key ?? "") ?? ""}{excuseBy.get(r.id)?.note ? ` · ${excuseBy.get(r.id)?.note}` : ""}</span> : null}</TD>
                      <TD className="text-xs text-slate-500">{r.source.replace(/_/g, " ")}{r.source_marked_by ? ` · ${r.source_marked_by}` : ""}{r.change_reason ? <span className="block text-slate-400">{r.change_reason}</span> : null}</TD>
                      {s.can("attendance.write") ? (
                        <TD className="text-right">
                          <details className="inline-block text-left">
                            <summary className="cursor-pointer text-xs text-brand">Correct…</summary>
                            <ActionForm action={correctAttendance} className="mt-2 w-64 space-y-2 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                              <input type="hidden" name="event_id" value={id} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="person_id" value={r.person_id} />
                              {r.status_key === "excused" ? <p className="text-xs text-slate-500">To change the excuse, use “Record an absence”.</p> : null}
                              <Select name="status_key" defaultValue={r.status_key === "excused" ? "absent" : r.status_key} className="h-8 text-xs" aria-label="New status">
                                {activeStatuses.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                              </Select>
                              <Input name="reason" placeholder="Reason (required)" required minLength={5} className="h-8 text-xs" />
                              <div className="flex gap-2">
                                <SubmitButton size="sm" name="op" value="update">Save</SubmitButton>
                                <SubmitButton size="sm" variant="danger-outline" name="op" value="delete">Remove record</SubmitButton>
                              </div>
                            </ActionForm>
                          </details>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescList items={[
                { label: "Semester", value: (ev.semesters as { name: string } | null)?.name },
                { label: "Planning status", value: ev.planning_status.replace("_", " ") },
                { label: "Attendance source", value: ev.attendance_source },
                { label: "Series", value: ev.series_key },
                { label: "Notes", value: ev.notes },
                { label: "Description", value: ev.description },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="PIN event names" description="Exports with these titles match this event automatically." />
            <CardBody className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {(pins ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{p.pin_name} {p.is_primary ? <Badge tone="blue">primary</Badge> : null}</span>
                    {s.can("events.write") ? (
                      <ActionForm action={removePinName} showMessage={false} confirm={{ title: "Remove this PIN name?", body: "Future exports with this title will no longer match automatically. Existing attendance is kept.", confirmLabel: "Remove", danger: true }}>
                        <input type="hidden" name="id" value={p.id} /><input type="hidden" name="event_id" value={id} />
                        <button className="text-xs text-red-700 hover:underline">Remove</button>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
                {(pins ?? []).length === 0 ? <li className="text-xs text-slate-500">None yet — set one when you import the PIN export.</li> : null}
              </ul>
              {s.can("events.write") ? (
                <ActionForm action={addPinName} resetOnSuccess className="flex gap-2">
                  <input type="hidden" name="event_id" value={id} />
                  <Input name="pin_name" placeholder="Add alias (exact PIN title)" className="h-8 text-xs" required aria-label="New PIN alias" />
                  <SubmitButton size="sm">Add</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>
          {ev.category_key !== "recruitment" && (canExcuse || excusedCount + unexcusedCount > 0) ? (
            <Card id="absences">
              <CardHeader title={`Absences (${excusedCount} excused · ${unexcusedCount} unexcused)`} description="Members who told an officer they couldn't attend. Excused absences don't count as attending; they protect from a strike for this event." />
              {canExcuse ? (
                <CardBody>
                  {absentCandidates.length ? <AbsenceForm reasons={reasons.filter((r) => r.is_active)} event={{ id }} members={absentCandidates} compact idPrefix="ev-ab" /> : <p className="text-xs text-slate-500">Every member is recorded as attending.</p>}
                </CardBody>
              ) : null}
            </Card>
          ) : null}
          {s.can("events.write") ? (
            <Card>
              <CardBody>
                <ActionForm action={setArchived} confirm={ev.archived_at ? undefined : { title: "Archive this event?", body: "It disappears from the calendar and its attendance stops counting. Nothing is deleted; you can restore it.", confirmLabel: "Archive", danger: true }}>
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="archive" value={ev.archived_at ? "false" : "true"} />
                  <SubmitButton size="sm" variant={ev.archived_at ? "secondary" : "danger-outline"}>{ev.archived_at ? "Restore event" : "Archive event"}</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {s.can("attendance.write") ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" id="quick-entry">
            <CardHeader title="Quick entry from a paper sign-in sheet" description="Tick everyone who signed in. People who already have a record are locked so nothing is double-counted." />
            <CardBody><RosterChecklist eventId={id} people={roster} statuses={activeStatuses} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Add a walk-in" description="Attended but is not on any list. Creates a prospective member — never a full member." />
            <CardBody>
              <ActionForm action={addWalkIn} resetOnSuccess className="space-y-2">
                <input type="hidden" name="event_id" value={id} />
                <Input name="first_name" placeholder="First name" aria-label="First name" />
                <Input name="last_name" placeholder="Last name" aria-label="Last name" />
                <Input name="email" type="email" placeholder="Email (recommended)" aria-label="Email" />
                <SubmitButton size="sm">Add and mark attended</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
