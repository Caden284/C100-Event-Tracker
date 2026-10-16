import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { loadPolicy } from "@/lib/data/roster";
import { fetchAll } from "@/lib/data/fetch-all";
import { displayName } from "@/lib/domain/normalize";
import { policyLabel } from "@/lib/domain/policy";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { proposeAction } from "../../actions";

export const metadata = { title: "Propose formal action" };

export default async function NewAction({ searchParams }: PageProps<"/standing/actions/new">) {
  const params = await searchParams;
  const s = await requirePermission("discipline.propose");
  const { current } = await resolveSemester(s.supabase);
  const { policy } = await loadPolicy(s, current);
  const members = await fetchAll((from, to) => s.supabase.from("v_people_directory").select("member_id, first_name, last_name, preferred_name, status_key").not("member_id", "is", null).order("last_name").order("person_id").range(from, to));
  const approved = policy?.status === "approved";
  return (
    <>
      <PageHeader title="Propose a formal action" back={{ href: "/standing?view=actions", label: "Formal actions" }} description={policyLabel(policy)} />
      {!approved ? (
        <Callout tone="draft" className="mb-4" title="No approved policy covers this semester">
          A formal action can only be recorded as an <strong>authorized override</strong> by an officer who can approve disciplinary actions, with a written reason. {s.can("discipline.approve") ? "" : "You do not have that permission."}
        </Callout>
      ) : null}
      <Card><CardBody>
        <ActionForm action={proposeAction} className="space-y-4">
          <input type="hidden" name="semester_id" value={current?.id ?? ""} /><input type="hidden" name="policy_id" value={policy?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Member" htmlFor="mid" required>
              <Select id="mid" name="member_id" defaultValue={typeof params.member === "string" ? params.member : ""} required>
                <option value="" disabled>Choose…</option>{members.map((m) => <option key={m.member_id} value={m.member_id!}>{displayName(m)} ({m.status_key})</option>)}
              </Select>
            </Field>
            <Field label="Action" htmlFor="at"><Select id="at" name="action_type"><option value="formal_warning">Formal warning</option><option value="probation">Probation</option><option value="removal">Removal</option><option value="other">Other</option></Select></Field>
            <Field label="Effective date" htmlFor="ed"><Input id="ed" name="effective_date" type="date" /></Field>
            <Field label="Review date" htmlFor="rd"><Input id="rd" name="review_date" type="date" /></Field>
          </div>
          <Field label="Reason" htmlFor="rs" required hint="Facts and the policy provision relied on."><Textarea id="rs" name="reason" required minLength={5} /></Field>
          {!approved && s.can("discipline.approve") ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <Checkbox name="is_override" label="Record as an authorized override (no approved policy)" />
              <Field label="Override justification" htmlFor="or"><Textarea id="or" name="override_reason" /></Field>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">The action starts as <strong>proposed</strong>. It takes effect only after an officer with approval permission approves it. The hub never notifies the member automatically.</p>
          <SubmitButton disabled={!approved && !s.can("discipline.approve")}>Submit proposal</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
