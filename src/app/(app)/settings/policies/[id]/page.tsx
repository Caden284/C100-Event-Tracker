import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { parseRules } from "@/lib/domain/policy";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { decidePolicy, newPolicyVersion, requestApproval, savePolicyDraft } from "../../actions";

export const metadata = { title: "Policy" };

export default async function PolicyPage({ params }: PageProps<"/settings/policies/[id]">) {
  const { id } = await params;
  const s = await requirePermission("policies.read");
  const [{ data: p }, { data: cats }, { data: statuses }, { data: history }] = await Promise.all([
    s.supabase.from("membership_policies").select("*").eq("id", id).maybeSingle(),
    s.supabase.from("event_categories").select("key, name, is_active").order("sort_order"),
    s.supabase.from("member_statuses").select("key, name").order("sort_order"),
    s.supabase.from("policy_approvals").select("action, note, created_at, profiles(full_name, email), semesters(name)").eq("policy_id", id).order("created_at", { ascending: false }),
  ]);
  if (!p) notFound();
  const r = parseRules(p.rules);
  const editable = p.status === "draft" && s.can("policies.write");
  const reqRows = [...r.requirements, ...Array.from({ length: Math.max(1, 6 - r.requirements.length) }, () => null)];
  const strikeRows = [...r.strikes.thresholds, ...Array.from({ length: Math.max(1, 4 - r.strikes.thresholds.length) }, () => null)];
  return (
    <>
      <PageHeader title={`${p.name} v${p.version}`} back={{ href: "/settings/policies", label: "Policies" }}
        badge={<Badge tone={p.status === "approved" ? "green" : p.status === "draft" ? "draft" : "neutral"}>{p.status === "draft" ? "DRAFT — pending executive board approval" : p.status}</Badge>}
        description={p.summary ?? undefined}
        actions={s.can("policies.write") && p.status !== "draft" ? (
          <ActionForm action={newPolicyVersion} showMessage={false}><input type="hidden" name="from_id" value={id} /><SubmitButton size="sm">Create new draft version</SubmitButton></ActionForm>) : null} />
      {p.status === "approved" ? <Callout tone="info" className="mb-4" title="Approved and locked">Approved {p.approved_at ? new Date(p.approved_at).toLocaleString("en-US") : ""}. {p.approval_note}. To change it, create a new draft version — past semesters are not changed without a recorded decision.</Callout> : null}
      <ActionForm action={savePolicyDraft} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <fieldset disabled={!editable} className="space-y-4">
          <Card>
            <CardHeader title="Attendance requirements (per semester)" description="Which event categories count toward which requirement. Recruitment should not count toward member standards." />
            <CardBody className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Policy name" htmlFor="pn"><Input id="pn" name="name" defaultValue={p.name} /></Field><Field label="Effective from" htmlFor="ef"><Input id="ef" name="effective_from" type="date" defaultValue={p.effective_from ?? ""} /></Field></div>
              <Textarea name="summary" defaultValue={p.summary ?? ""} placeholder="Summary" aria-label="Summary" />
              {reqRows.map((q, i) => (
                <div key={i} className="grid items-end gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_6rem_3fr]">
                  <Field label="Requirement" htmlFor={`rl${i}`}><Input id={`rl${i}`} name={`req_label_${i}`} defaultValue={q?.label ?? ""} placeholder={q ? "" : "(add another)"} /></Field>
                  <Field label="Key" htmlFor={`rk${i}`}><Input id={`rk${i}`} name={`req_key_${i}`} defaultValue={q?.key ?? ""} /></Field>
                  <Field label="Required" htmlFor={`rr${i}`}><Input id={`rr${i}`} name={`req_required_${i}`} type="number" min={0} defaultValue={q?.required ?? ""} /></Field>
                  <fieldset><legend className="text-xs font-medium text-slate-700">Counts events in</legend><div className="mt-1 flex flex-wrap gap-2">{(cats ?? []).map((c) => <label key={c.key} className="flex items-center gap-1 text-xs"><input type="checkbox" name={`req_cats_${i}`} value={c.key} defaultChecked={q?.categories.includes(c.key)} />{c.name}</label>)}</div></fieldset>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Standing rules" />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Checkbox name="dues_required" defaultChecked={r.dues_required_for_good_standing} label="Dues must be paid (or waived) for Good Standing" />
              <Field label="Standout multiplier" htmlFor="sm" hint="Total counted ≥ multiplier × combined requirement. Blank disables."><Input id="sm" name="standout_multiplier" type="number" step="0.1" min={1} defaultValue={r.standout_multiplier ?? ""} /></Field>
              <Checkbox name="excused_counts" defaultChecked={r.excused_counts_as_attended} label="Excused absences count as attended" />
              <Checkbox name="waivers_allowed" defaultChecked={r.waivers_allowed} label="Requirement waivers / exceptions are permitted" />
              <Checkbox name="credit_pre_membership" defaultChecked={r.credit_pre_membership_attendance} label="Count attendance from before a member's start date (e.g. recruitment)" />
              <Checkbox name="at_risk_enabled" defaultChecked={r.at_risk_enabled} label="Show behind-pace warnings" />
              <fieldset className="sm:col-span-2"><legend className="text-xs font-medium text-slate-700">Statuses evaluated against standards</legend><div className="mt-1 flex flex-wrap gap-3">{(statuses ?? []).map((x) => <label key={x.key} className="flex items-center gap-1 text-sm"><input type="checkbox" name="tracked_statuses" value={x.key} defaultChecked={r.tracked_statuses.includes(x.key)} />{x.name}</label>)}</div></fieldset>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Strikes, probation, review and appeals" description="Thresholds have no effect until this policy is approved AND strikes are enabled." />
            <CardBody className="space-y-3">
              <Checkbox name="strikes_enabled" defaultChecked={r.strikes.enabled} label="Enable strike thresholds once approved" />
              {strikeRows.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <Input name={`strike_n_${i}`} type="number" min={1} defaultValue={t?.strikes ?? ""} placeholder="Strikes" aria-label="Strikes" />
                  <Input name={`strike_label_${i}`} defaultValue={t?.label ?? ""} placeholder="Label (e.g. Warning)" aria-label="Label" />
                  <Select name={`strike_action_${i}`} defaultValue={t?.action ?? "formal_warning"} aria-label="Action"><option value="formal_warning">Formal warning</option><option value="probation">Probation</option><option value="removal">Removal</option><option value="other">Other</option></Select>
                </div>
              ))}
              <Field label="Probation criteria" htmlFor="pc"><Textarea id="pc" name="probation_criteria" defaultValue={r.probation_criteria} /></Field>
              <Field label="Review process" htmlFor="rp"><Textarea id="rp" name="review_process" defaultValue={r.review_process} /></Field>
              <Field label="Appeal process" htmlFor="ap"><Textarea id="ap" name="appeal_process" defaultValue={r.appeal_process} /></Field>
            </CardBody>
          </Card>
        </fieldset>
        {editable ? <SubmitButton>Save draft</SubmitButton> : null}
      </ActionForm>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {p.status === "draft" ? (
          <Card>
            <CardHeader title="Approval" />
            <CardBody className="space-y-4">
              {s.can("policies.write") ? (
                <ActionForm action={requestApproval} className="flex gap-2"><input type="hidden" name="id" value={id} /><Input name="note" placeholder="Note for approvers" aria-label="Note" /><SubmitButton size="sm" variant="secondary">Request approval</SubmitButton></ActionForm>
              ) : null}
              {s.can("policies.approve") ? (
                <ActionForm action={decidePolicy} className="space-y-2" confirm={{ title: "Approve this policy?", body: "It becomes locked and can govern official standing decisions for the semesters it is assigned to." }}>
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="approved" />
                  <Input name="note" placeholder="Approval record, e.g. Approved by e-board vote 7–1 on Oct 20, 2026" required aria-label="Approval record" />
                  <Input name="confirm_text" placeholder="Type APPROVE" required aria-label="Confirmation" />
                  <SubmitButton size="sm">Approve policy</SubmitButton>
                </ActionForm>
              ) : <p className="text-xs text-slate-500">Only officers with policy-approval permission can approve.</p>}
            </CardBody>
          </Card>
        ) : p.status === "approved" && s.can("policies.approve") ? (
          <Card><CardHeader title="Retire" /><CardBody>
            <ActionForm action={decidePolicy} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="retired" />
              <Input name="note" placeholder="Reason" required aria-label="Reason" /><Input name="confirm_text" placeholder="Type RETIRE" required aria-label="Confirmation" /><SubmitButton size="sm" variant="danger-outline">Retire policy</SubmitButton></ActionForm>
          </CardBody></Card>
        ) : null}
        <Card>
          <CardHeader title="Change history" />
          <CardBody><ul className="space-y-1 text-xs">{(history ?? []).map((h, i) => <li key={i}>{new Date(h.created_at).toLocaleString("en-US")} · <strong>{h.action.replace(/_/g, " ")}</strong>{(h.semesters as { name: string } | null) ? ` (${(h.semesters as { name: string }).name})` : ""} — {(h.profiles as { full_name: string | null; email: string } | null)?.full_name ?? "system"}{h.note ? `: ${h.note}` : ""}</li>)}</ul></CardBody>
        </Card>
      </div>
    </>
  );
}
