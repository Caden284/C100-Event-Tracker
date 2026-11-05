import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadApplicants, loadCurrentCycle, loadProgress } from "@/lib/data/interviews";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { CYCLE_STATUS_LABELS } from "@/lib/domain/interviews";
import { PageHeader, Callout, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addApplicant, recountEngagement, setCyclePhase, updateCycle } from "../actions";

export const metadata = { title: "Intake setup" };

export default async function IntakeSetupPage() {
  const s = await requirePermission("interviews.manage");
  const cycle = await loadCurrentCycle(s);
  if (!cycle) {
    return (<><PageHeader title="Intake setup" back={{ href: "/interviews", label: "Interviews" }} /><EmptyState title="No intake exists yet">Ask a super administrator to create one.</EmptyState></>);
  }
  const [applicants, progress, prospects] = await Promise.all([
    loadApplicants(s, cycle.id),
    loadProgress(s, cycle.id),
    fetchAll((f, t) => s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, prospect_id, prospect_status, member_id").not("prospect_id", "is", null).is("member_id", null).order("last_name").order("person_id").range(f, t)),
  ]);
  const inCycle = new Set(applicants.map((a) => a.person_id));
  const candidates = prospects.filter((p) => !inCycle.has(p.person_id!));
  const unassigned = applicants.filter((a) => !a.interviewer_id && a.status !== "withdrawn").length;
  const next = { setup: "interviewing", interviewing: "deliberation", deliberation: "closed", closed: null }[cycle.status];

  return (
    <>
      <PageHeader title="Intake setup" back={{ href: "/interviews", label: "Interviews" }} description={`${cycle.name} · ${applicants.length} applicants`}
        badge={<Badge tone="neutral">{CYCLE_STATUS_LABELS[cycle.status]}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Phase" description="Setting up → Interviewing → Deliberation → Closed. Scores lock when deliberation opens." />
          <CardBody className="space-y-3 text-sm">
            {cycle.status === "setup" ? <p>Assign interviewers, then open interviews. {unassigned ? <strong>{unassigned} applicants have no interviewer yet;</strong> : null} officers can also take unassigned ones themselves.</p> : null}
            {cycle.status === "interviewing" ? <p>Interviewers are scoring. Before opening deliberation, check every interview is submitted (progress below). Opening it <strong>locks every score</strong> and shows them to the board.</p> : null}
            {cycle.status === "deliberation" ? <p>Deliberation opened {cycle.deliberation_opened_at ? new Date(cycle.deliberation_opened_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : ""}. Record decisions on the Ranking tab, then close the intake.</p> : null}
            {next === "interviewing" ? (
              <ActionForm action={setCyclePhase}><input type="hidden" name="id" value={cycle.id} /><input type="hidden" name="status" value="interviewing" /><SubmitButton size="lg">Open interviews</SubmitButton></ActionForm>
            ) : null}
            {next === "deliberation" ? (
              <ActionForm action={setCyclePhase} className="space-y-2" confirm={{ title: "Open deliberation and lock all scores?", body: "No score can change after this, and everyone with interview access will see every score. This can't be undone.", danger: true, confirmLabel: "Lock and open" }}>
                <input type="hidden" name="id" value={cycle.id} /><input type="hidden" name="status" value="deliberation" />
                <Input name="confirm_text" placeholder="Type LOCK" required aria-label="Type LOCK to confirm" className="h-11" />
                <SubmitButton size="lg" variant="danger">Open deliberation</SubmitButton>
              </ActionForm>
            ) : null}
            {next === "closed" ? (
              <ActionForm action={setCyclePhase} confirm={{ title: "Close this intake?", body: "It becomes read-only." }}><input type="hidden" name="id" value={cycle.id} /><input type="hidden" name="status" value="closed" /><SubmitButton variant="secondary">Close intake</SubmitButton></ActionForm>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Progress by interviewer" description="Counts only: scores stay blind until deliberation." />
          {progress.length === 0 ? <CardBody><p className="text-sm text-slate-500">No applicants yet.</p></CardBody> : (
            <Table>
              <THead><tr><TH>Interviewer</TH><TH className="text-right">Assigned</TH><TH className="text-right">Done</TH><TH className="text-right">Submitted</TH><TH className="text-right">No-show</TH></tr></THead>
              <TBody>{progress.map((p) => (
                <TR key={p.interviewer_id ?? "none"}><TD className={p.interviewer_id ? "" : "text-amber-700"}>{p.interviewer_id ? p.interviewer_name : "Unassigned"}</TD>
                  <TD className="tabular text-right">{p.assigned}</TD><TD className="tabular text-right">{p.completed}</TD><TD className="tabular text-right">{p.submitted}</TD><TD className="tabular text-right">{p.no_show}</TD></TR>
              ))}</TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Settings" />
          <CardBody>
            <ActionForm action={updateCycle} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={cycle.id} />
              <Field label="Name" htmlFor="cn" className="sm:col-span-2"><Input id="cn" name="name" defaultValue={cycle.name} className="h-11" /></Field>
              <Field label="Spots" htmlFor="sp"><Input id="sp" name="spots" type="number" min={1} defaultValue={cycle.spots} className="h-11" /></Field>
              <Field label="Decisions go out by" htmlFor="db"><Input id="db" name="decisions_by" type="date" defaultValue={cycle.decisions_by ?? ""} className="h-11" /></Field>
              <Field label="New member dues ($)" htmlFor="da"><Input id="da" name="dues_amount" type="number" min={0} step="1" defaultValue={cycle.dues_amount_cents !== null ? cycle.dues_amount_cents / 100 : ""} className="h-11" /></Field>
              <Field label="Dues due by" htmlFor="dd"><Input id="dd" name="dues_due" type="date" defaultValue={cycle.dues_due ?? ""} className="h-11" /></Field>
              <p className="text-xs text-slate-500 sm:col-span-2">These dates fill in the read-aloud script. Until they&apos;re set, interviewers see “[decisions date]”.</p>
              <div className="sm:col-span-2"><SubmitButton disabled={cycle.status === "closed"}>Save settings</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Engagement points" description="Chapter events attended, counted from the hub's attendance up to a cutoff, then frozen so they can't move mid-process." />
          <CardBody className="space-y-3 text-sm">
            <p>{cycle.engagement_counted_at ? <>Counted through <strong>{formatDate(cycle.engagement_cutoff)}</strong> on {new Date(cycle.engagement_counted_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}.</> : "Not counted yet."} Tiers: {cycle.config.engagement.map((t) => `${t.min}+ events = ${t.points}`).join(" · ")} · none = 0.</p>
            {cycle.status !== "deliberation" && cycle.status !== "closed" ? (
              <ActionForm action={recountEngagement} className="flex flex-wrap items-end gap-2" confirm={{ title: "Recount engagement?", body: "Every applicant's events and points are recalculated from attendance through this date." }}>
                <input type="hidden" name="id" value={cycle.id} />
                <Field label="Count attendance through" htmlFor="co"><Input id="co" name="cutoff" type="date" required defaultValue={cycle.engagement_cutoff ?? todayIso()} className="h-11" /></Field>
                <SubmitButton variant="secondary">Recount</SubmitButton>
              </ActionForm>
            ) : <Callout tone="info">Frozen for deliberation.</Callout>}
          </CardBody>
        </Card>

        {cycle.status !== "closed" ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Add an applicant" description="Pick an existing prospective member, or add someone new by name (an email can be added later on their record)." />
            <CardBody>
              <ActionForm action={addApplicant} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="cycle_id" value={cycle.id} />
                <Field label="Existing prospective member" htmlFor="pp" className="sm:col-span-3">
                  <Select id="pp" name="person_id" defaultValue="" className="h-11"><option value="">— New person (enter name below) —</option>{candidates.map((p) => <option key={p.person_id} value={p.person_id!}>{displayName(p)}</option>)}</Select>
                </Field>
                <Field label="First name (new person)" htmlFor="fn"><Input id="fn" name="first_name" className="h-11" /></Field>
                <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" className="h-11" /></Field>
                <Field label="Email (optional)" htmlFor="em"><Input id="em" name="email" type="email" className="h-11" /></Field>
                <Field label="Group" htmlFor="ag"><Select id="ag" name="group_label" className="h-11" defaultValue=""><option value="">—</option><option>Underclassmen</option><option>Upperclassmen</option></Select></Field>
                <Field label="Tier" htmlFor="at"><Input id="at" name="tier" className="h-11" /></Field>
                <Field label="Classification" htmlFor="ac"><Select id="ac" name="classification" className="h-11" defaultValue=""><option value="">—</option><option>Freshman</option><option>Sophomore</option><option>Junior</option><option>Senior</option><option>Grad Student</option></Select></Field>
                <Field label="Major" htmlFor="am"><Input id="am" name="major" className="h-11" /></Field>
                <Field label="GPA" htmlFor="agpa"><Input id="agpa" name="gpa" type="number" step="0.01" min={0} max={4.5} className="h-11" /></Field>
                <Field label="Hours / week offered" htmlFor="ah"><Select id="ah" name="hours_offered" className="h-11" defaultValue=""><option value="">—</option><option>1-3 hours</option><option>4-6 hours</option><option>6+ hours</option></Select></Field>
                <div className="sm:col-span-3"><SubmitButton>Add applicant</SubmitButton></div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
