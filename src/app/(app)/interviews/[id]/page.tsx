import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { loadApplicants, loadCycle, loadInterviewers, loadScores, officerRole } from "@/lib/data/interviews";
import { formatDate, formatDateTimeEastern, isoToEasternLocal } from "@/lib/domain/dates";
import { APPLICANT_STATUS_LABELS, RECOMMENDATION_LABELS, interviewTotal, maxInterviewScore, type Recommendation } from "@/lib/domain/interviews";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { InterviewSheet } from "./interview-sheet";
import { assignInterview, claimInterview, releaseInterview, setInterviewStatus, updateApplicantFacts } from "../actions";

export const metadata = { title: "Interview" };

const STATUS_TONE: Record<string, "neutral" | "green" | "red" | "amber" | "blue"> = { scheduled: "blue", completed: "green", no_show: "red", rescheduled: "amber", withdrawn: "neutral" };

export default async function InterviewPage({ params }: PageProps<"/interviews/[id]">) {
  const { id } = await params;
  const s = await requirePermission("interviews.conduct", "interviews.manage");
  const { data: ref } = await s.supabase.from("intake_applicants").select("cycle_id").eq("id", id).maybeSingle();
  if (!ref) notFound();
  const [cycle, applicants, scores, role] = await Promise.all([loadCycle(s, ref.cycle_id), loadApplicants(s, ref.cycle_id, { id }), loadScores(s, [id]), officerRole(s)]);
  const a = applicants[0];
  if (!cycle || !a) notFound();
  const manage = s.can("interviews.manage");
  const interviewers = manage ? await loadInterviewers(s) : [];
  const mine = a.interviewer_id === s.userId;
  const myScore = scores.find((x) => x.interviewer_id === s.userId) ?? null;
  const deliberation = cycle.status === "deliberation" || cycle.status === "closed";
  const canScore = mine && s.can("interviews.conduct") && (cycle.status === "interviewing" || (deliberation && !!myScore));
  const cfg = cycle.config;
  const facts: [string, string | null][] = [
    ["Classification", a.classification], ["Major", a.major], ["GPA", a.gpa !== null ? String(a.gpa) : null], ["Hours / week offered", a.hours_offered],
    ["Events attended", a.engagement_events !== null ? `${a.engagement_events} · ${a.engagement_points ?? 0} pts` : "Not counted yet"],
  ];
  const placeholders = {
    name: a.first_name, "your name": s.fullName?.split(" ")[0] ?? null, "your role": role,
    "decisions date": cycle.decisions_by ? formatDate(cycle.decisions_by, { weekday: "long", month: "long", day: "numeric" }) : null,
    "dues date": cycle.dues_due ? formatDate(cycle.dues_due, { weekday: "long", month: "long", day: "numeric" }) : null,
    dues: cycle.dues_amount_cents !== null ? `$${(cycle.dues_amount_cents / 100).toFixed(0)}` : null,
  };

  return (
    <>
      <PageHeader title={a.name} back={{ href: "/interviews", label: "Interviews" }}
        badge={<><Badge tone={STATUS_TONE[a.status]}>{APPLICANT_STATUS_LABELS[a.status]}</Badge>{a.group_label ? <Badge tone="neutral">{a.group_label}{a.tier ? ` · ${a.tier}` : ""}</Badge> : null}</>}
        description={[a.interviewer_name ? `Interviewer: ${mine ? "you" : a.interviewer_name}` : "No interviewer yet", a.slot_at ? formatDateTimeEastern(a.slot_at) : a.slot_note].filter(Boolean).join(" · ")} />

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-5">
        {facts.map(([k, v], i) => (
          <div key={k} className={i === facts.length - 1 ? "col-span-2 bg-white px-3 py-2.5 sm:col-span-1" : "bg-white px-3 py-2.5"}><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{v ?? "—"}</dd></div>
        ))}
      </dl>

      {cycle.status === "setup" ? <Callout tone="info" className="mb-4">Interviews haven&apos;t opened yet. The coordinator opens them from Intake setup.</Callout> : null}

      {!a.interviewer_id && cycle.status === "interviewing" && s.can("interviews.conduct") ? (
        <Card className="mb-4"><CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">Nobody is interviewing {a.first_name ?? "this applicant"} yet.</p>
          <ActionForm action={claimInterview}><input type="hidden" name="id" value={a.id} /><SubmitButton size="lg">I&apos;ll interview them</SubmitButton></ActionForm>
        </CardBody></Card>
      ) : null}

      {canScore ? (
        <InterviewSheet applicantId={a.id} userId={s.userId} config={cfg} placeholders={placeholders}
          initial={{
            scores: myScore?.scores ?? {}, answers: myScore?.answers ?? {}, own_question: myScore?.own_question ?? "", own_notes: myScore?.own_notes ?? "",
            recommendation: (myScore?.recommendation as Recommendation | null) ?? null, red_flag: myScore?.red_flag ?? false,
            red_flag_note: myScore?.red_flag_note ?? "", notes: myScore?.notes ?? "",
          }}
          initialSavedAt={myScore?.updated_at ?? null} initialSubmittedAt={myScore?.submitted_at ?? null} locked={cycle.status !== "interviewing"} />
      ) : !deliberation && a.interviewer_id && !mine ? (
        <Callout tone="info" className="mb-4" title="Scores are blind until deliberation">Only {a.interviewer_name ?? "the interviewer"} can see this sheet until the board opens deliberation.</Callout>
      ) : null}

      {deliberation && scores.length ? (
        <Card className="mb-4">
          <CardHeader title="Interview scores" description="Visible to the board now that deliberation is open." />
          <CardBody className="space-y-4">
            {scores.map((sc) => (
              <div key={sc.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold">{interviewTotal(sc.scores, cfg) ?? "–"} / {maxInterviewScore(cfg)} {sc.recommendation ? <Badge tone="blue" className="ml-1">{RECOMMENDATION_LABELS[sc.recommendation as Recommendation]}</Badge> : null}{sc.red_flag ? <Badge tone="red" className="ml-1">Red flag</Badge> : null}{!sc.submitted_at ? <Badge tone="amber" className="ml-1">Not submitted</Badge> : null}</p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">{cfg.rubric.map((c) => <li key={c.key}>{c.label}: <strong>{sc.scores[c.key] ?? "–"}</strong></li>)}</ul>
                {sc.red_flag_note ? <p className="mt-2 text-red-800">Red flag: {sc.red_flag_note}</p> : null}
                {cfg.questions.map((q, i) => sc.answers[q.key] ? <p key={q.key} className="mt-2 text-slate-700"><span className="font-medium">Q{i + 1}:</span> {sc.answers[q.key]}</p> : null)}
                {sc.own_question ? <p className="mt-2 text-slate-700"><span className="font-medium">Own question:</span> {sc.own_question}{sc.own_notes ? ` — ${sc.own_notes}` : ""}</p> : null}
                {sc.notes ? <p className="mt-2 text-slate-700"><span className="font-medium">Notes:</span> {sc.notes}</p> : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {mine && cycle.status === "interviewing" ? (
          <Card>
            <CardHeader title="If something comes up" />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {a.status !== "no_show" ? (
                  <ActionForm action={setInterviewStatus} confirm={{ title: "Mark as a no-show?", body: "Per the packet: message them at minute 5, wait until minute 8, then release the slot." }}>
                    <input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="no_show" />
                    <SubmitButton variant="secondary" size="lg">No-show</SubmitButton>
                  </ActionForm>
                ) : null}
                {a.status !== "rescheduled" ? (
                  <ActionForm action={setInterviewStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="rescheduled" /><SubmitButton variant="secondary" size="lg">Needs rescheduling</SubmitButton></ActionForm>
                ) : null}
                {a.status !== "scheduled" && a.status !== "completed" ? (
                  <ActionForm action={setInterviewStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="scheduled" /><SubmitButton variant="ghost" size="lg">Back to scheduled</SubmitButton></ActionForm>
                ) : null}
              </div>
              <ActionForm action={releaseInterview} className="space-y-2" confirm={{ title: "Hand this interview back?", body: "The coordinator is notified and will reassign it. Your saved notes stay private to you." }}>
                <input type="hidden" name="id" value={a.id} />
                <Select name="reason" aria-label="Reason" className="h-11" defaultValue="I know this applicant personally">
                  <option>I know this applicant personally</option><option>I can’t make this time</option><option>Other</option>
                </Select>
                <SubmitButton variant="danger-outline" size="lg">Hand it back</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}

        {manage ? (
          <Card>
            <CardHeader title="Coordinator" description="Interviewer, time slot and the applicant's details." />
            <CardBody className="space-y-4">
              <ActionForm action={assignInterview} className="space-y-3">
                <input type="hidden" name="id" value={a.id} />
                <Field label="Interviewer" htmlFor="iv"><Select id="iv" name="interviewer_id" defaultValue={a.interviewer_id ?? ""} className="h-11"><option value="">Unassigned</option>{interviewers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Slot (Eastern)" htmlFor="slot"><Input id="slot" name="slot_at" type="datetime-local" defaultValue={isoToEasternLocal(a.slot_at)} className="h-11" /></Field>
                  <Field label="Slot note" htmlFor="sn"><Input id="sn" name="slot_note" defaultValue={a.slot_note ?? ""} placeholder="e.g. Zoom link sent" className="h-11" /></Field>
                </div>
                <SubmitButton>Save assignment</SubmitButton>
              </ActionForm>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand">Edit applicant details</summary>
                <ActionForm action={updateApplicantFacts} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={a.id} />
                  <Field label="Group" htmlFor="g"><Input id="g" name="group_label" defaultValue={a.group_label ?? ""} /></Field>
                  <Field label="Tier" htmlFor="t"><Input id="t" name="tier" defaultValue={a.tier ?? ""} /></Field>
                  <Field label="Classification" htmlFor="c"><Input id="c" name="classification" defaultValue={a.classification ?? ""} /></Field>
                  <Field label="Major" htmlFor="m"><Input id="m" name="major" defaultValue={a.major ?? ""} /></Field>
                  <Field label="GPA" htmlFor="gpa"><Input id="gpa" name="gpa" type="number" step="0.01" min={0} max={4.5} defaultValue={a.gpa ?? ""} /></Field>
                  <Field label="Hours / week offered" htmlFor="h"><Input id="h" name="hours_offered" defaultValue={a.hours_offered ?? ""} /></Field>
                  <div className="sm:col-span-2"><SubmitButton variant="secondary">Save details</SubmitButton></div>
                </ActionForm>
              </details>
              {a.status !== "withdrawn" ? (
                <ActionForm action={setInterviewStatus} confirm={{ title: "Mark as withdrawn?", body: "Use this when the applicant drops out. They stay on record." }}>
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="withdrawn" />
                  <SubmitButton variant="ghost" size="sm">Applicant withdrew</SubmitButton>
                </ActionForm>
              ) : null}
              <p className="text-xs text-slate-500"><Link className="underline" href={`/people/${a.person_id}`}>Open their prospective-member record</Link>{a.email ? ` · ${a.email}` : " · no email on file yet"}</p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
