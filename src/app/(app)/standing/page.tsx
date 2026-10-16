import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { loadStanding } from "@/lib/data/roster";
import { activeStrikeCount, strikeEligibility, ACTION_LABELS } from "@/lib/domain/standing";
import { formatDate } from "@/lib/domain/dates";
import { policyLabel } from "@/lib/domain/policy";
import { PageHeader, Callout, EmptyState, StatCard, Tabs } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StandingBadge, StatusBadge } from "@/components/standing-badge";
import { sp } from "@/lib/url";
import { decideAction } from "./actions";

export const metadata = { title: "Probation & standing" };

export default async function StandingPage({ searchParams }: PageProps<"/standing">) {
  const params = await searchParams;
  const s = await requirePermission("standing.read");
  const view = sp(params, "view") ?? "attention";
  const { current } = await resolveSemester(s.supabase);
  const { policy, rules, members } = await loadStanding(s, current);
  const [strikes, actions] = await Promise.all([
    s.can("discipline.read") ? s.supabase.from("strike_records").select("member_id, points, voided_at, semester_id") : Promise.resolve({ data: [] }),
    s.can("discipline.read") ? s.supabase.from("disciplinary_actions").select("*, members(id, people(first_name, last_name, preferred_name)), membership_policies(name, version, status)").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const strikeBy = new Map<string, { points: number; voided_at: string | null; semester_id: string | null }[]>();
  for (const r of (strikes.data ?? []) as { member_id: string; points: number; voided_at: string | null; semester_id: string | null }[]) strikeBy.set(r.member_id, [...(strikeBy.get(r.member_id) ?? []), r]);
  const tracked = members.filter((m) => m.progress.standing !== "not_tracked");
  const attention = tracked.filter((m) => m.progress.needsAttention);
  const withStrikes = members.map((m) => ({ m, e: strikeEligibility(activeStrikeCount(strikeBy.get(m.member_id) ?? [], current?.id), rules, policy?.status ?? null) })).filter((x) => x.e.strikes > 0);
  const acts = (actions.data ?? []) as Array<Record<string, unknown> & { id: string; status: string; action_type: string; reason: string; is_override: boolean; override_reason: string | null; effective_date: string | null; review_date: string | null; resolution: string | null; created_at: string; members: { id: string; people: { first_name: string | null; last_name: string | null } } }>;
  const approvedPolicy = policy?.status === "approved";
  const checklist = [
    { done: !!policy, text: "A membership policy is assigned to this semester" },
    { done: approvedPolicy, text: "The executive board has approved the attendance requirements" },
    { done: approvedPolicy && rules.strikes.enabled, text: "Strike thresholds are approved and enabled" },
    { done: !!rules.probation_criteria, text: "Probation criteria are written down" },
    { done: !!rules.review_process, text: "A review process is defined" },
    { done: !!rules.appeal_process, text: "An appeal process is defined (if adopted)" },
  ];
  return (
    <>
      <PageHeader title="Probation & standing" description={`${current?.name ?? "No semester"} · ${policyLabel(policy)}`}
        actions={s.can("policies.read") ? <Link href="/settings/policies" className="text-sm font-medium text-brand hover:underline">Policy settings →</Link> : null} />
      {!approvedPolicy ? (
        <Callout tone="draft" className="mb-4" title="Draft — pending executive board approval">
          The strike system (1 = warning, 2 = probation, 3 = removal) and the attendance requirements are drafts. The hub shows progress and informational eligibility only. It does not issue warnings, place anyone on probation, or recommend removal until a policy is approved.
        </Callout>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tracked members" value={tracked.length} />
        <StatCard label="Needing attention" value={attention.length} hint="System warning" tone={attention.length ? "warn" : "default"} />
        <StatCard label="With strikes" value={withStrikes.length} hint={approvedPolicy ? "Approved policy" : "Draft — informational"} tone="draft" />
        <StatCard label="Formal actions in force" value={acts.filter((a) => a.status === "approved" || a.status === "active").length} hint="Approved decisions" />
      </div>
      <Tabs current={view} tabs={[
        { key: "attention", label: "Needs attention", href: "/standing?view=attention", count: attention.length },
        { key: "strikes", label: "Strikes (eligibility)", href: "/standing?view=strikes", count: withStrikes.length },
        { key: "actions", label: "Formal actions", href: "/standing?view=actions", count: acts.length },
        { key: "setup", label: "Policy checklist", href: "/standing?view=setup" },
      ]} />
      <div className="mt-4">
        {view === "attention" ? (
          <Card>
            <CardHeader title="Members needing attention" description="Behind pace, unable to meet a requirement with the events still scheduled, or missing an email. These are prompts for follow-up, not disciplinary findings." />
            {attention.length === 0 ? <EmptyState title="No one is flagged" /> : (
              <Table>
                <THead><tr><TH>Member</TH><TH>Status</TH><TH>Progress</TH><TH>What needs attention</TH><TH>Calculated</TH></tr></THead>
                <TBody>{attention.map((m) => (
                  <TR key={m.member_id}>
                    <TD><Link className="font-medium text-ink hover:text-brand" href={`/members/${m.member_id}`}>{m.name}</Link><span className="block text-xs text-slate-500">{m.email ?? "no email"}</span></TD>
                    <TD><StatusBadge status={m.status_key} /></TD>
                    <TD className="tabular">{m.progress.percentComplete}%</TD>
                    <TD className="text-xs text-slate-600"><ul className="space-y-0.5">{[...m.progress.warnings, ...(m.progress.standing === "no_email" ? ["No email — scans cannot be matched"] : [])].map((w) => <li key={w}>{w}</li>)}</ul></TD>
                    <TD><StandingBadge p={m.progress} draft={!approvedPolicy} /></TD>
                  </TR>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {view === "strikes" ? (
          <Card>
            <CardHeader title="Strike counts" description="Thresholds are shown as eligibility under the policy. Reaching one never changes anyone's status automatically." />
            {!s.can("discipline.read") ? <EmptyState title="You do not have access to strike records" /> : withStrikes.length === 0 ? <EmptyState title="No strikes recorded" /> : (
              <Table>
                <THead><tr><TH>Member</TH><TH className="text-right">Strikes</TH><TH>Eligibility</TH></tr></THead>
                <TBody>{withStrikes.map(({ m, e }) => (
                  <TR key={m.member_id}><TD><Link className="font-medium hover:text-brand" href={`/members/${m.member_id}`}>{m.name}</Link></TD><TD className="tabular text-right">{e.strikes}</TD>
                    <TD className="text-xs">{e.label ? <Badge tone={approvedPolicy && e.policyEnabled ? "red" : "draft"}>{e.label}{approvedPolicy && e.policyEnabled ? "" : " (draft)"}</Badge> : null} {e.approaching ? <Badge tone="amber">approaching {e.next?.label}</Badge> : null}<span className="mt-1 block text-slate-500">{e.description}</span></TD></TR>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {view === "actions" ? (
          <Card>
            <CardHeader title="Formal warnings, probation and other actions" description="Each action records who initiated it, who approved it, the policy version, dates and resolution."
              actions={s.can("discipline.propose") ? <Link href="/standing/actions/new" className="text-xs font-medium text-brand hover:underline">Propose an action →</Link> : null} />
            {acts.length === 0 ? <EmptyState title="No formal actions on record" /> : (
              <Table>
                <THead><tr><TH>Member</TH><TH>Action</TH><TH>Status</TH><TH>Reason</TH><TH>Dates</TH>{s.can("discipline.approve") ? <TH>Decision</TH> : null}</tr></THead>
                <TBody>{acts.map((a) => {
                  const pol = a.membership_policies as { name: string; version: number; status: string } | null;
                  const ppl = a.members.people;
                  return (
                    <TR key={a.id}>
                      <TD><Link className="font-medium hover:text-brand" href={`/members/${a.members.id}`}>{`${ppl.first_name ?? ""} ${ppl.last_name ?? ""}`}</Link></TD>
                      <TD>{ACTION_LABELS[a.action_type]}{a.is_override ? <Badge tone="amber" className="ml-1">override</Badge> : null}<span className="block text-xs text-slate-400">{pol ? `${pol.name} v${pol.version} (${pol.status})` : "no policy"}</span></TD>
                      <TD><Badge tone={a.status === "approved" || a.status === "active" ? "red" : a.status === "proposed" ? "amber" : "neutral"}>{a.status}</Badge></TD>
                      <TD className="max-w-xs text-xs">{a.reason}{a.override_reason ? <span className="block text-amber-800">Override: {a.override_reason}</span> : null}{a.resolution ? <span className="block text-slate-500">Resolution: {a.resolution}</span> : null}</TD>
                      <TD className="text-xs">Proposed {formatDate(a.created_at.slice(0, 10))}{a.effective_date ? <><br />Effective {formatDate(a.effective_date)}</> : null}{a.review_date ? <><br />Review {formatDate(a.review_date)}</> : null}</TD>
                      {s.can("discipline.approve") ? (
                        <TD>
                          {["proposed", "approved", "active"].includes(a.status) ? (
                            <ActionForm action={decideAction} className="space-y-1" confirm={{ title: "Record this decision?", body: "The decision, your name and the time are recorded permanently. Notify the member through the chapter's approved process." }}>
                              <input type="hidden" name="id" value={a.id} />
                              <Select name="status" className="h-8 text-xs" aria-label="Decision" defaultValue="">
                                <option value="" disabled>Decide…</option>
                                {a.status === "proposed" ? <><option value="approved">Approve</option><option value="rejected">Reject</option></> : null}
                                {a.status === "approved" ? <option value="active">Mark active</option> : null}
                                <option value="resolved">Resolve</option><option value="overturned">Overturn (appeal)</option>
                              </Select>
                              <Input name="resolution" placeholder="Resolution / note" className="h-8 text-xs" aria-label="Resolution" />
                              <Input name="appeal_outcome" placeholder="Appeal outcome (optional)" className="h-8 text-xs" aria-label="Appeal outcome" />
                              <SubmitButton size="sm" variant="secondary">Record</SubmitButton>
                            </ActionForm>
                          ) : null}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {view === "setup" ? (
          <Card>
            <CardHeader title="Setup checklist before using standing for official decisions" />
            <CardBody>
              <ul className="space-y-2 text-sm">{checklist.map((c) => <li key={c.text} className="flex items-center gap-2">{c.done ? <Badge tone="green">Done</Badge> : <Badge tone="draft">To do</Badge>}{c.text}</li>)}</ul>
              <h3 className="mt-5 text-sm font-semibold">Proposals for board consideration (not chapter rules)</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Issue a strike only after an officer reviews attendance at a fixed checkpoint (e.g. mid-semester and final week), not continuously.</li>
                <li>Do not count members without an email as missing attendance until the email is fixed.</li>
                <li>Allow excused absences for documented academic or medical conflicts, recorded with a reason.</li>
                <li>Require a written notice and a review meeting before probation takes effect, with an appeal window (e.g. 7 days).</li>
                <li>Decide whether dues status is part of Good Standing or handled separately by the Treasurer.</li>
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
