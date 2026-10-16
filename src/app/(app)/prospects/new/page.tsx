import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createProspect } from "../actions";

export const metadata = { title: "Add prospect" };

export default async function NewProspect() {
  const s = await requirePermission("prospects.write");
  const { current } = await resolveSemester(s.supabase);
  return (
    <>
      <PageHeader title="Add a prospective member" back={{ href: "/prospects", label: "Prospective members" }} />
      <Card><CardBody>
        <ActionForm action={createProspect} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="semester_id" value={current?.id ?? ""} />
          <Field label="First name" htmlFor="fn"><Input id="fn" name="first_name" /></Field>
          <Field label="Last name" htmlFor="ln"><Input id="ln" name="last_name" /></Field>
          <Field label="GSU email" htmlFor="em" hint="Lets their PIN scans match automatically."><Input id="em" name="email" type="email" /></Field>
          <Field label="Notes" htmlFor="nt" className="sm:col-span-2"><Textarea id="nt" name="notes" /></Field>
          <div className="sm:col-span-2"><SubmitButton>Create</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
