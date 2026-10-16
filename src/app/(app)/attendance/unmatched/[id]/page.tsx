import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { formatDate } from "@/lib/domain/dates";
import { displayName, similarity } from "@/lib/domain/normalize";
import { PageHeader, Callout, DescList } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { assignScan, resolveScan } from "../actions";
import { REASONS } from "../reasons";

export const metadata = { title: "Resolve scan" };

export default async function ResolveScan({ params }: PageProps<"/attendance/unmatched/[id]">) {
  const { id } = await params;
  const s = await requirePermission("unmatched.resolve");
  const { data: u } = await s.supabase.from("unmatched_scans").select("*, events(id, name, event_date), attendance_imports(file_name)").eq("id", id).maybeSingle();
  if (!u) notFound();
  const [people, { data: events }, { data: officers }] = await Promise.all([
    fetchAll((from, to) => s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, email, member_id, prospect_id, status_key").order("last_name").order("person_id").range(from, to)),
    s.supabase.from("events").select("id, name, event_date").is("archived_at", null).order("event_date", { ascending: false }).limit(300),
    s.supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
  ]);
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  const ranked = people
    .map((p) => ({ p, score: similarity(name, displayName(p)) + (u.email && p.email && p.email.split("@")[0] === u.email.toLowerCase().split("@")[0] ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const label = (p: (typeof people)[number]) => `${displayName(p)} — ${p.member_id ? `member (${p.status_key})` : "prospect"} — ${p.email ?? "no email"}`;
  const ev = u.events as { id: string; name: string; event_date: string | null } | null;

  return (
    <>
      <PageHeader title={`Resolve: ${name || u.email || "unknown"}`} back={{ href: "/attendance/unmatched", label: "Unmatched scans" }} />
      <Callout tone="warning" className="mb-4" title="Confirm identity before linking">
        Similar names are not proof of identity. If you cannot confirm who this is (for example a paper sign-in with no email), dismiss it with a note rather than guessing.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="From the source" />
          <CardBody className="space-y-4">
            <DescList items={[
              { label: "Name", value: name || null }, { label: "Email", value: u.email }, { label: "Card ID", value: u.card_id },
              { label: "Event", value: ev ? `${ev.name} (${formatDate(ev.event_date)})` : u.pin_event_name }, { label: "Reason", value: REASONS[u.reason] ?? u.reason },
              { label: "Details", value: u.details }, { label: "Source file", value: (u.attendance_imports as { file_name: string } | null)?.file_name ?? u.source },
            ]} />
            <ActionForm action={assignScan} className="flex items-end gap-2">
              <input type="hidden" name="scan_id" value={id} />
              <Field label="Assigned reviewer" htmlFor="assigned_to" className="flex-1">
                <Select id="assigned_to" name="assigned_to" defaultValue={u.assigned_to ?? ""} className="h-8 text-xs">
                  <option value="">Unassigned</option>{(officers ?? []).map((o) => <option key={o.id} value={o.id}>{o.full_name ?? o.email}</option>)}
                </Select>
              </Field>
              <SubmitButton size="sm" variant="secondary">Assign</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Link to an existing member or prospect" description="Records attendance for the selected person. Closest names are listed first — check the email." />
            <CardBody>
              <ActionForm action={resolveScan} className="space-y-3">
                <input type="hidden" name="scan_id" value={id} /><input type="hidden" name="action" value="link" />
                <Field label="Person" htmlFor="person_id" required>
                  <Select id="person_id" name="person_id" required defaultValue="">
                    <option value="" disabled>Choose…</option>
                    <optgroup label="Closest names">{ranked.slice(0, 8).map(({ p }) => <option key={p.person_id} value={p.person_id!}>{label(p)}</option>)}</optgroup>
                    <optgroup label="Everyone (A–Z)">{people.map((p) => <option key={`a${p.person_id}`} value={p.person_id!}>{label(p)}</option>)}</optgroup>
                  </Select>
                </Field>
                <EventSelect events={events ?? []} current={ev?.id} />
                {u.email ? <Checkbox name="add_email" defaultChecked label={`Also save ${u.email} on this person so future scans match automatically`} hint="Skipped if the email already belongs to someone." /> : null}
                <Field label="Note" htmlFor="note1"><Input id="note1" name="note" placeholder="How did you confirm the identity?" /></Field>
                <SubmitButton>Link and record attendance</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Create a new record" description="For someone not on any list. Creating a full member requires confirming their membership." />
            <CardBody>
              <ActionForm action={resolveScan} className="space-y-3">
                <input type="hidden" name="scan_id" value={id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="First name" htmlFor="fn"><Input id="fn" name="first_name" defaultValue={u.first_name ?? ""} /></Field>
                  <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" defaultValue={u.last_name ?? ""} /></Field>
                  <Field label="Email" htmlFor="em"><Input id="em" name="email" type="email" defaultValue={u.email && u.email.includes("@") ? u.email : ""} /></Field>
                </div>
                <EventSelect events={events ?? []} current={ev?.id} />
                <input type="hidden" name="add_email" value="on" />
                <Field label="Note" htmlFor="note2"><Input id="note2" name="note" /></Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="action" value="create_prospect">Create prospective member</SubmitButton>
                  {s.can("members.write") ? <SubmitButton name="action" value="create_member" variant="secondary">Create member (Not Verified)</SubmitButton> : null}
                </div>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Close without recording attendance" />
            <CardBody>
              <ActionForm action={resolveScan} className="space-y-3" confirm={{ title: "Close this scan?", body: "No attendance will be recorded for it. The scan and your note stay in the history." }}>
                <input type="hidden" name="scan_id" value={id} />
                <Field label="Reason (required)" htmlFor="note3"><Textarea id="note3" name="note" required minLength={3} placeholder="e.g. Could not confirm identity; duplicate of row 12" /></Field>
                <div className="flex gap-2">
                  <SubmitButton name="action" value="duplicate" variant="secondary">Mark as duplicate</SubmitButton>
                  <SubmitButton name="action" value="dismiss" variant="danger-outline">Dismiss as invalid</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function EventSelect({ events, current }: { events: { id: string; name: string; event_date: string | null }[]; current?: string }) {
  return (
    <Field label="Event" htmlFor={`ev-${current ?? "x"}`} required>
      <Select id={`ev-${current ?? "x"}`} name="event_id" defaultValue={current ?? ""} required>
        <option value="" disabled>Choose the event…</option>
        {events.map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} — {e.name}</option>)}
      </Select>
    </Field>
  );
}
