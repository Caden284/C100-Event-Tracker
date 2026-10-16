import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { fetchAll } from "@/lib/data/fetch-all";
import { getSetting } from "@/lib/data/settings";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { prospectEngagement } from "@/lib/domain/recognition";
import { PageHeader, Callout, DescList, EmptyState, StatCard } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, CATEGORY_TONES } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { convertProspect, updateProspect } from "../actions";

export const metadata = { title: "Prospective member" };

export default async function ProspectPage({ params }: PageProps<"/prospects/[id]">) {
  const { id } = await params;
  const s = await requirePermission("prospects.read");
  const { data: p } = await s.supabase.from("prospective_members").select("*, people(*), first_event:events!prospective_members_first_seen_event_id_fkey(id, name, event_date)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const person = p.people as { id: string; first_name: string | null; last_name: string | null; preferred_name: string | null };
  const [{ current, all }, { data: ids }, facts, settings, { data: officers }, { data: statuses }] = await Promise.all([
    resolveSemester(s.supabase),
    s.supabase.from("person_identifiers").select("kind, value, is_primary").eq("person_id", person.id),
    s.can("attendance.read") ? fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("id, event_id, event_name, event_date, category_key, counts_as_attended, status_key, source").eq("person_id", person.id).order("event_date").order("id").range(from, to)) : Promise.resolve([]),
    getSetting(s.supabase, "prospect_engagement"),
    s.supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    s.supabase.from("member_statuses").select("key, name").eq("is_active", true).order("sort_order"),
  ]);
  const email = (ids ?? []).find((i) => i.kind === "email" && i.is_primary)?.value ?? null;
  const eng = prospectEngagement(facts.map((f) => ({ event_date: f.event_date, counts_as_attended: !!f.counts_as_attended })), settings);
  const name = displayName(person);
  const first = p.first_event as { id: string; name: string; event_date: string | null } | null;
  const converted = p.status === "converted";

  return (
    <>
      <PageHeader title={name} back={{ href: "/prospects", label: "Prospective members" }}
        badge={<><Badge tone={converted ? "blue" : "gold"}>{converted ? "Converted to member" : p.status.replace("_", " ")}</Badge><Badge tone={eng.interest === "high" ? "green" : eng.interest === "medium" ? "gold" : "neutral"}>{p.interest_override ?? eng.interest} interest</Badge></>}
        description={email ?? "No email on file"} />
      {converted && p.converted_member_id ? <Callout tone="info" className="mb-4">This person is now a member. <Link className="underline" href={`/members/${p.converted_member_id}`}>Open member record</Link>. Recruitment attendance stays here and does not count toward member standards unless policy says so.</Callout> : null}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Events attended" value={eng.eventsAttended} hint="All categories (workbook rule)" />
        <StatCard label="First seen" value={first ? first.name : p.first_seen_text ?? "—"} hint={first?.event_date ? formatDate(first.event_date) : undefined} />
        <StatCard label="Most recent" value={eng.lastSeen ? formatDate(eng.lastSeen) : "—"} />
        <StatCard label="Months active" value={eng.distinctMonths} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance timeline" />
          {facts.length === 0 ? <EmptyState title="No attendance recorded yet" /> : (
            <Table>
              <THead><tr><TH>Date</TH><TH>Event</TH><TH>Category</TH><TH>Status</TH><TH>Source</TH></tr></THead>
              <TBody>{facts.map((f) => (
                <TR key={f.id}><TD className="whitespace-nowrap">{formatDate(f.event_date)}</TD><TD><Link className="hover:text-brand" href={`/events/${f.event_id}`}>{f.event_name}</Link></TD>
                  <TD>{f.category_key ? <Badge tone={CATEGORY_TONES[f.category_key]}>{f.category_key}</Badge> : "—"}</TD><TD>{f.status_key}</TD><TD className="text-xs text-slate-500">{f.source?.replace(/_/g, " ")}</TD></TR>
              ))}</TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Recruitment follow-up" />
          <CardBody>
            {s.can("prospects.write") ? (
              <ActionForm action={updateProspect} className="space-y-3">
                <input type="hidden" name="prospect_id" value={id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="First name" htmlFor="fn"><Input id="fn" name="first_name" defaultValue={person.first_name ?? ""} /></Field>
                  <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" defaultValue={person.last_name ?? ""} /></Field>
                </div>
                <Field label="Email" htmlFor="em"><Input id="em" name="email" type="email" defaultValue={email ?? ""} /></Field>
                <Field label="Follow-up status" htmlFor="fu">
                  <Select id="fu" name="follow_up_status" defaultValue={p.follow_up_status}>
                    <option value="not_contacted">Not contacted</option><option value="contacted">Contacted</option><option value="interested">Interested</option><option value="follow_up_later">Follow up later</option><option value="not_interested">Not interested</option>
                  </Select>
                </Field>
                <Field label="Assigned officer" htmlFor="ao">
                  <Select id="ao" name="assigned_officer_id" defaultValue={p.assigned_officer_id ?? ""}><option value="">Unassigned</option>{(officers ?? []).map((o) => <option key={o.id} value={o.id}>{o.full_name ?? o.email}</option>)}</Select>
                </Field>
                <Field label="Interest indicator" htmlFor="io" hint={`Calculated: ${eng.interest}. Override only with a reason in the notes.`}>
                  <Select id="io" name="interest_override" defaultValue={p.interest_override ?? ""}><option value="">Use calculated</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
                </Field>
                <Field label="Recruitment status" htmlFor="rs">
                  <Select id="rs" name="status" defaultValue={p.status} disabled={converted}><option value="in_recruitment">In recruitment</option><option value="withdrawn">Withdrawn</option><option value="not_eligible">Not eligible</option>{converted ? <option value="converted">Converted</option> : null}</Select>
                </Field>
                {converted ? <input type="hidden" name="status" value="converted" /> : null}
                <Field label="Next steps" htmlFor="ns"><Textarea id="ns" name="next_steps" defaultValue={p.next_steps ?? ""} /></Field>
                <Field label="Notes" htmlFor="nt"><Textarea id="nt" name="notes" defaultValue={p.notes ?? ""} /></Field>
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            ) : <DescList items={[{ label: "Follow-up", value: p.follow_up_status }, { label: "Next steps", value: p.next_steps }, { label: "Notes", value: p.notes }]} />}
          </CardBody>
        </Card>
      </div>

      {!converted && s.can("prospects.convert") ? (
        <Card className="mt-4">
          <CardHeader title="Convert to member" description="Use only after the chapter has officially accepted this person. The same person record is kept — nothing is duplicated." />
          <CardBody>
            <ActionForm action={convertProspect} className="space-y-4" confirm={{ title: `Convert ${name} to a member?`, body: "Their recruitment history is preserved. Attendance before the membership start date will NOT count toward member standards unless the semester's policy explicitly allows it.", confirmLabel: "Convert" }}>
              <input type="hidden" name="prospect_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Membership start date" htmlFor="msd" required><Input id="msd" name="member_since" type="date" defaultValue={todayIso()} required /></Field>
                <Field label="Semester" htmlFor="sem" required><Select id="sem" name="semester_id" defaultValue={current?.id ?? ""} required>{all.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Initial status" htmlFor="ist"><Select id="ist" name="status_key" defaultValue="active">{(statuses ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</Select></Field>
                <Field label="How was membership confirmed?" htmlFor="why" required><Input id="why" name="reason" required minLength={5} placeholder="e.g. Accepted by vote, Nov 6 GBM" /></Field>
              </div>
              {!email ? <Callout tone="warning">No email on file — add one above first so their scans keep matching.</Callout> : null}
              <Checkbox name="confirm_identity" label={`I verified this is ${name}${email ? ` (${email})` : ""} and not a different person with a similar name.`} />
              <Checkbox name="confirm_membership" label="The chapter has officially made this person a member." />
              <SubmitButton>Convert to member</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
