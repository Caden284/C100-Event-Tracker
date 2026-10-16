import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createMember } from "../actions";

export const metadata = { title: "Add member" };

export default async function NewMember() {
  const s = await requirePermission("members.write");
  const { data: statuses } = await s.supabase.from("member_statuses").select("key, name").eq("is_active", true).order("sort_order");
  return (
    <>
      <PageHeader title="Add a member" back={{ href: "/members", label: "Members" }} />
      <Callout tone="info" className="mb-4">If this person is already a prospective member, open their record and use <strong>Convert to member</strong> instead, so their recruitment history stays attached.</Callout>
      <Card><CardBody>
        <ActionForm action={createMember} className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="fn"><Input id="fn" name="first_name" /></Field>
          <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" /></Field>
          <Field label="GSU email" htmlFor="em" hint="Needed to match PIN scans."><Input id="em" name="email" type="email" /></Field>
          <Field label="Status" htmlFor="st"><Select id="st" name="status_key" defaultValue="not_verified">{(statuses ?? []).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</Select></Field>
          <Field label="E-Board role" htmlFor="er"><Input id="er" name="eboard_role" /></Field>
          <Field label="Committee" htmlFor="cm"><Input id="cm" name="committee" /></Field>
          <Field label="Member since" htmlFor="ms"><Input id="ms" name="member_since" type="date" /></Field>
          <Field label="Reason / source" htmlFor="rs"><Input id="rs" name="reason" placeholder="e.g. Confirmed at Oct 6 GBM" /></Field>
          <div className="sm:col-span-2"><SubmitButton>Create member</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
