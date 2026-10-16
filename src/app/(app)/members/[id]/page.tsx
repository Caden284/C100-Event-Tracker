import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { loadPolicy, loadSemesterEvents } from "@/lib/data/roster";
import { fetchAll } from "@/lib/data/fetch-all";
import { getSetting } from "@/lib/data/settings";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { computeProgress, scheduledRemainingByCategory } from "@/lib/domain/progress";
import { activeStrikeCount, strikeEligibility, ACTION_LABELS } from "@/lib/domain/standing";
import { policyLabel } from "@/lib/domain/policy";
import { PageHeader, Callout, DescList, EmptyState, Progress } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StandingBadge, StatusBadge } from "@/components/standing-badge";
import { addNote, recordDues, recordStrike, updateMember, voidStrike } from "../actions";
import { AbsenceForm } from "@/components/absence-form";
import { loadAbsenceReasons, loadAbsences } from "@/lib/data/absences";

export const metadata = { title: "Member" };

export default async function MemberPage({ params }: PageProps<"/members/[id]">) {
  const { id } = await params;
  const s = await requirePermission("members.read");
  const { data: m } = await s.supabase.from("members").select("*, people(*), member_statuses(name)").eq("id", id).maybeSingle();
  if (!m) notFound();
  const person = m.people as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null; created_at: string };
  const { current, all } = await resolveSemester(s.supabase);
  const today = todayIso();
  const [{ policy, rules }, ids, facts, statusHistory, notes, dues, strikes, actions, recog, statuses, events, atRisk, audit, prospect] = await Promise.all([
    loadPolicy(s, current),
    s.supabase.from("person_identifiers").select("id, kind, value, is_primary, retired_at, source, created_at").eq("person_id", person.id).order("created_at"),
    s.can("attendance.read") ? fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("id, event_id, event_name, event_date, semester_id, category_key, effective_category, counts_as_attended, status_key, source").eq("person_id", person.id).order("event_date", { ascending: false }).order("id").range(from, to)) : Promise.resolve([]),
    s.supabase.from("member_status_history").select("from_status, to_status, reason, changed_at, profiles(full_name, email)").eq("member_id", id).order("changed_at", { ascending: false }),
    s.can("members.notes") ? s.supabase.from("member_notes").select("id, body, source, created_at, profiles(full_name, email)").eq("member_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    s.can("dues.read") ? s.supabase.from("member_dues").select("semester_id, status, amount_cents, paid_on, note, semesters(name)").eq("member_id", id) : Promise.resolve({ data: null }),
    s.can("discipline.read") ? s.supabase.from("strike_records").select("*").eq("member_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    s.can("discipline.read") ? s.supabase.from("disciplinary_actions").select("*").eq("member_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    s.can("recognition.read") ? s.supabase.from("recognition_results").select("outcome, is_official, approved_at, recognition_periods(name, semesters(name), recognition_categories(name))").eq("person_id", person.id).eq("is_official", true) : Promise.resolve({ data: null }),
    s.supabase.from("member_statuses").select("key, name").order("sort_order"),
    current ? loadSemesterEvents(s, current.id) : Promise.resolve([]),
    getSetting(s.supabase, "at_risk"),
    s.can("audit.read") ? s.supabase.from("audit_logs").select("id, occurred_at, action, table_name, reason, changes, actor_id").in("record_id", [id, person.id]).order("occurred_at", { ascending: false }).limit(30) : Promise.resolve({ data: null }),
    s.supabase.from("prospective_members").select("id, status, converted_at").eq("person_id", person.id).maybeSingle(),
  ]);
  const email = (ids.data ?? []).find((i) => i.kind === "email" && i.is_primary)?.value ?? null;
  const semDues = (dues.data ?? []).find((d) => d.semester_id === current?.id) ?? null;
  const duesOk = await (current ? s.supabase.rpc("member_dues_ok", { p_semester: current.id }) : Promise.resolve({ data: [] }));
  const myDues = ((duesOk.data ?? []) as { member_id: string; dues_recorded: boolean; dues_ok: boolean }[]).find((d) => d.member_id === id);
  const semFacts = facts.filter((f) => f.semester_id === current?.id).map((f) => ({ ...f, event_id: f.event_id!, counts_as_attended: !!f.counts_as_attended, status_key: f.status_key! }));
  const progress = computeProgress(
    { status_key: m.status_key, email, member_since: m.member_since, dues_status: myDues ? (myDues.dues_recorded ? (myDues.dues_ok ? "paid" : "unpaid") : null) : null },
    semFacts, rules, { semester: current, today, scheduledRemaining: scheduledRemainingByCategory(events, today), behindPaceMargin: atRisk.behind_pace_margin },
  );
  const [absences, reasons] = await Promise.all([
    current ? loadAbsences(s, current.id, { personId: person.id }) : Promise.resolve({ rows: [], canSeeReasons: false }),
    s.can("attendance.excuse") || s.can("members.notes") ? loadAbsenceReasons(s, true) : Promise.resolve([]),
  ]);
  const reasonName = new Map(reasons.map((r) => [r.key, r.name]));
  const excuseCap = rules.strikes.max_excused_per_semester;
  const strikeCats = rules.strikes.triggers.unexcused_absence.categories;
  const capUsed = absences.rows.filter((a) => a.excused && a.category_key && strikeCats.includes(a.category_key)).length;
  const strikeCount = activeStrikeCount((strikes.data ?? []) as never, current?.id);
  const elig = strikeEligibility(strikeCount, rules, policy?.status ?? null);
  const name = displayName(person);
  const bySemester = new Map<string, typeof facts>();
  for (const f of facts) bySemester.set(f.semester_id ?? "none", [...(bySemester.get(f.semester_id ?? "none") ?? []), f]);
  const semName = new Map(all.map((x) => [x.id, x.name]));

  return (
    <>
      <PageHeader title={name} back={{ href: "/members", label: "Members" }}
        badge={<><StatusBadge status={m.status_key} label={(m.member_statuses as { name: string } | null)?.name} />{m.eboard_role ? <Badge tone="purple">{m.eboard_role}</Badge> : null}</>}
        description={`${email ?? "No email on file"}${m.committee ? ` · Committee: ${m.committee}` : ""}${m.member_since ? ` · Member since ${formatDate(m.member_since)}` : ""}`} />
      {!email ? <Callout tone="warning" className="mb-4" title="No email — data-quality issue">PIN scans are matched by email, so attendance for this member may be missing. Add their GSU email below. This is not evidence that they did not attend.</Callout> : null}
      {prospect.data?.status === "converted" ? <Callout tone="info" className="mb-4">Converted from a prospective member{prospect.data.converted_at ? ` on ${formatDate(prospect.data.converted_at.slice(0, 10))}` : ""}. <Link className="underline" href={`/prospects/${prospect.data.id}`}>Recruitment history</Link>.</Callout> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Progress · ${current?.name ?? "no semester"}`} description={policyLabel(policy)} actions={<StandingBadge p={progress} draft={policy?.status !== "approved"} />} />
          <CardBody className="space-y-4">
            {policy?.status === "draft" ? <Callout tone="draft">Calculated with a DRAFT policy. This is attendance progress, not a chapter decision.</Callout> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {progress.requirements.map((r) => (
                <div key={r.key} className="rounded-md border border-slate-200 p-3">
                  <div className="flex justify-between text-sm"><span className="font-medium">{r.label}</span><span className="tabular">{r.attended} / {r.required}</span></div>
                  <div className="mt-2"><Progress value={r.attended} max={r.required} tone={r.met ? "green" : "brand"} /></div>
                  <p className="mt-1 text-xs text-slate-500">{r.met ? "Met" : `${r.remaining} to go`}{r.scheduledRemaining !== null && !r.met ? ` · ${r.scheduledRemaining} scheduled` : ""}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this standing</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{progress.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              {progress.warnings.length ? <ul className="mt-2 space-y-0.5 text-sm text-amber-800">{progress.warnings.map((w) => <li key={w}>⚠ {w} <span className="text-xs text-slate-500">(system warning)</span></li>)}</ul> : null}
            </div>
          </CardBody>
        </Card>

        <div className="min-w-0 space-y-4">
          {s.can("discipline.read") ? (
            <Card>
              <CardHeader title="Strikes & formal actions" />
              <CardBody className="space-y-3 text-sm">
                <p>{elig.description}</p>
                {m.legacy_strikes ? <p className="text-xs text-slate-500">Workbook strike count (historical): {m.legacy_strikes}</p> : null}
                <ul className="space-y-1">
                  {(actions.data ?? []).map((a) => <li key={a.id}><Badge tone={a.status === "approved" || a.status === "active" ? "red" : "neutral"}>{ACTION_LABELS[a.action_type]} · {a.status}</Badge> <span className="text-xs text-slate-500">{a.reason}</span></li>)}
                  {(actions.data ?? []).length === 0 ? <li className="text-xs text-slate-500">No formal warnings or probation on record.</li> : null}
                </ul>
                <ul className="space-y-1 text-xs">
                  {(strikes.data ?? []).map((st) => (
                    <li key={st.id} className={st.voided_at ? "text-slate-400 line-through" : ""}>
                      {formatDate(st.created_at.slice(0, 10))}: {st.points > 0 ? "+" : ""}{st.points} — {st.reason}
                      {!st.voided_at && s.can("discipline.propose") ? (
                        <ActionForm action={voidStrike} className="mt-1 flex gap-1" showMessage={false}>
                          <input type="hidden" name="id" value={st.id} /><input type="hidden" name="member_id" value={id} />
                          <Input name="void_reason" placeholder="Void reason" required className="h-7 text-xs" aria-label="Void reason" />
                          <SubmitButton size="sm" variant="ghost">Void</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {s.can("discipline.propose") ? (
                  <details><summary className="cursor-pointer text-xs font-medium text-brand">Record a strike…</summary>
                    <ActionForm action={recordStrike} className="mt-2 space-y-2" confirm={{ title: "Record a strike?", body: policy?.status === "approved" ? "It will count toward the approved thresholds. Formal actions still need approval." : "The strike policy is a DRAFT: this is tracking only and triggers no action." }}>
                      <input type="hidden" name="member_id" value={id} /><input type="hidden" name="semester_id" value={current?.id ?? ""} /><input type="hidden" name="policy_id" value={policy?.id ?? ""} />
                      <Input name="reason" placeholder="Reason (required)" required minLength={5} className="h-8 text-xs" aria-label="Strike reason" />
                      <Select name="points" defaultValue="1" className="h-8 text-xs" aria-label="Points"><option value="1">+1 strike</option><option value="-1">−1 (remove one)</option></Select>
                      <SubmitButton size="sm" variant="secondary">Record</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
                {s.can("discipline.propose") ? <Link href={`/standing/actions/new?member=${id}`} className="block text-xs font-medium text-brand hover:underline">Propose a formal action →</Link> : null}
              </CardBody>
            </Card>
          ) : null}
          {s.can("attendance.read") && current ? (
            <Card>
              <CardHeader title="Absences" description={excuseCap === null ? current.name : `${current.name} · ${capUsed} of ${excuseCap} excused absences used`} />
              <CardBody className="space-y-3 text-sm">
                {absences.rows.length === 0 ? <p className="text-xs text-slate-500">No absences recorded this semester.</p> : (
                  <ul className="space-y-1 text-xs">{absences.rows.map((a) => (
                    <li key={a.record_id}>
                      <Badge tone={a.excused ? "blue" : "amber"}>{a.excused ? "Excused" : "Unexcused"}</Badge>{" "}
                      {formatDate(a.event_date)} · <Link href={`/events/${a.event_id}`} className="hover:text-brand">{a.event_name}</Link>
                      {a.excused && absences.canSeeReasons ? <span className="block text-slate-500">{reasonName.get(a.reason_key ?? "") ?? ""}{a.note ? ` · ${a.note}` : ""}</span> : null}
                    </li>
                  ))}</ul>
                )}
                {excuseCap !== null && capUsed > excuseCap ? <Callout tone="warning">Over the excuse limit: excuses after the first {excuseCap} no longer protect from strikes.</Callout> : null}
                {s.can("attendance.excuse") ? (
                  <details><summary className="cursor-pointer text-xs font-medium text-brand">Record an absence…</summary>
                    <div className="mt-2"><AbsenceForm reasons={reasons.filter((r) => r.is_active)} member={{ member_id: id, person_id: person.id }}
                      events={events.filter((e) => e.event_date && !e.archived_at && e.planning_status !== "cancelled" && e.category_key !== "recruitment")} compact idPrefix="mem-ab" /></div>
                  </details>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          {s.can("dues.read") ? (
            <Card>
              <CardHeader title="Dues" description={current?.dues_deadline ? `Deadline ${formatDate(current.dues_deadline)}` : undefined} />
              <CardBody className="space-y-3 text-sm">
                <p>{semDues ? <Badge tone={semDues.status === "paid" || semDues.status === "waived" ? "green" : "amber"}>{semDues.status}</Badge> : <Badge>Not recorded</Badge>} {semDues?.amount_cents != null ? `$${(semDues.amount_cents / 100).toFixed(2)}` : ""} {semDues?.paid_on ? `on ${formatDate(semDues.paid_on)}` : ""}</p>
                {s.can("dues.write") && current ? (
                  <ActionForm action={recordDues} className="space-y-2">
                    <input type="hidden" name="member_id" value={id} /><input type="hidden" name="semester_id" value={current.id} />
                    <div className="flex gap-2">
                      <Select name="status" defaultValue={semDues?.status ?? "paid"} className="h-8 text-xs" aria-label="Dues status"><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option><option value="waived">Waived</option></Select>
                      <Input name="amount" type="number" step="0.01" min="0" placeholder="Amount $" className="h-8 text-xs" aria-label="Amount" />
                    </div>
                    <Input name="paid_on" type="date" className="h-8 text-xs" aria-label="Paid on" />
                    <Input name="note" placeholder="Note (e.g. receipt #)" className="h-8 text-xs" aria-label="Note" />
                    <SubmitButton size="sm" variant="secondary">Save dues</SubmitButton>
                  </ActionForm>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
          {s.can("recognition.read") ? (
            <Card>
              <CardHeader title="Recognition history" />
              <CardBody>{(recog.data ?? []).length ? <ul className="space-y-1 text-sm">{(recog.data ?? []).map((r, i) => { const p = r.recognition_periods as unknown as { name: string; semesters: { name: string }; recognition_categories: { name: string } }; return <li key={i}><Badge tone="gold">{p.recognition_categories.name}</Badge> {p.semesters.name} · {r.outcome.replace("_", " ")}</li>; })}</ul> : <p className="text-xs text-slate-500">No official recognition yet.</p>}</CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Attendance history" description="All semesters. Past recruitment attendance is shown but counts toward member standards only under policy." />
        {facts.length === 0 ? <EmptyState title="No attendance recorded" /> : (
          <Table>
            <THead><tr><TH>Semester</TH><TH>Date</TH><TH>Event</TH><TH>Category</TH><TH>Status</TH><TH>Source</TH></tr></THead>
            <TBody>
              {[...bySemester.entries()].flatMap(([sid, list]) => list.map((f, i) => (
                <TR key={f.id}>
                  <TD className="text-xs text-slate-500">{i === 0 ? semName.get(sid) ?? "No semester" : ""}</TD>
                  <TD className="whitespace-nowrap">{formatDate(f.event_date)}</TD>
                  <TD><Link href={`/events/${f.event_id}`} className="hover:text-brand">{f.event_name}</Link></TD>
                  <TD>{f.category_key ? <Badge tone={CATEGORY_TONES[f.category_key]}>{f.category_key}</Badge> : "—"}{f.effective_category !== f.category_key ? <span className="ml-1 text-xs text-slate-400">counts as {f.effective_category ?? "none"}</span> : null}</TD>
                  <TD><Badge tone={f.counts_as_attended ? "green" : f.status_key === "excused" ? "blue" : f.status_key === "absent" ? "amber" : "neutral"}>{f.status_key === "absent" ? "unexcused" : f.status_key}</Badge>{m.member_since && f.event_date && f.event_date < m.member_since ? <span className="block text-xs text-slate-400">before membership</span> : null}</TD>
                  <TD className="text-xs text-slate-500">{f.source?.replace(/_/g, " ")}</TD>
                </TR>
              )))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {s.can("members.write") ? (
          <Card>
            <CardHeader title="Edit record" description="The member keeps the same internal ID even if their name or email changes." />
            <CardBody>
              <ActionForm action={updateMember} className="space-y-3">
                <input type="hidden" name="member_id" value={id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name" htmlFor="fn"><Input id="fn" name="first_name" defaultValue={person.first_name ?? ""} /></Field>
                  <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" defaultValue={person.last_name ?? ""} /></Field>
                  <Field label="Preferred name" htmlFor="pn"><Input id="pn" name="preferred_name" defaultValue={person.preferred_name ?? ""} /></Field>
                  <Field label="Primary email" htmlFor="em" hint="Old emails are kept so earlier PIN scans still match."><Input id="em" name="email" type="email" defaultValue={email ?? ""} /></Field>
                  <Field label="E-Board role" htmlFor="er"><Input id="er" name="eboard_role" defaultValue={m.eboard_role ?? ""} /></Field>
                  <Field label="Committee" htmlFor="cm"><Input id="cm" name="committee" defaultValue={m.committee ?? ""} /></Field>
                  <Field label="Official membership status" htmlFor="st"><Select id="st" name="status_key" defaultValue={m.status_key}>{(statuses.data ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</Select></Field>
                  <Field label="Member since" htmlFor="ms" hint="Attendance before this date doesn't count unless policy allows."><Input id="ms" name="member_since" type="date" defaultValue={m.member_since ?? ""} /></Field>
                </div>
                <Field label="Reason for change" htmlFor="rs" hint="Required when the status changes."><Input id="rs" name="reason" /></Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
        <div className="space-y-4">
          {s.can("members.notes") ? (
            <Card>
              <CardHeader title="Private notes" description="Visible only to officers with the notes permission." />
              <CardBody className="space-y-3">
                <ActionForm action={addNote} resetOnSuccess className="space-y-2">
                  <input type="hidden" name="member_id" value={id} />
                  <Textarea name="body" required placeholder="Add a note…" aria-label="New note" />
                  <SubmitButton size="sm" variant="secondary">Add note</SubmitButton>
                </ActionForm>
                <ul className="space-y-2 text-sm">
                  {(notes.data ?? []).map((n) => <li key={n.id} className="rounded-md bg-slate-50 p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-slate-400">{n.source === "workbook" ? "From workbook" : ((n.profiles as { full_name: string | null } | null)?.full_name ?? "Officer")} · {new Date(n.created_at).toLocaleDateString("en-US")}</p></li>)}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Identifiers & history" />
            <CardBody className="space-y-3 text-sm">
              <DescList items={[
                { label: "Emails", value: (ids.data ?? []).filter((i) => i.kind !== "card_id").map((i) => `${i.value}${i.is_primary ? " (primary)" : i.retired_at ? " (previous)" : ""}`).join(", ") || null },
                { label: "PIN card IDs", value: (ids.data ?? []).filter((i) => i.kind === "card_id").map((i) => i.value).join(", ") || null },
                { label: "Record created", value: new Date(m.created_at).toLocaleString("en-US") },
                { label: "Last modified", value: new Date(m.updated_at).toLocaleString("en-US") },
              ]} />
              <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status history</h3>
              <ul className="space-y-1 text-xs">{(statusHistory.data ?? []).map((h, i) => <li key={i}>{new Date(h.changed_at).toLocaleDateString("en-US")}: {h.from_status ? `${h.from_status} → ` : ""}<strong>{h.to_status}</strong> — {h.reason ?? "no reason"} <span className="text-slate-400">{(h.profiles as { full_name: string | null } | null)?.full_name ?? ""}</span></li>)}</ul>
              {audit.data ? (<>
                <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Change log</h3>
                <ul className="space-y-1 text-xs">{audit.data.map((a) => <li key={a.id}>{new Date(a.occurred_at).toLocaleString("en-US")} · {a.action} {a.table_name} {a.reason ? `— ${a.reason}` : ""} <span className="text-slate-400">{Object.keys((a.changes as object) ?? {}).slice(0, 4).join(", ")}</span></li>)}</ul>
              </>) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
