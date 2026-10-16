import { requirePermission } from "@/lib/auth";
import { Callout, PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { importEvents } from "../actions";

export const metadata = { title: "Import calendar" };

export default async function ImportEventsPage() {
  await requirePermission("events.write");
  return (
    <>
      <PageHeader title="Import a programming calendar" back={{ href: "/events", label: "Events" }}
        description="Create many events at once from a CSV or Excel file. Events that already exist (same name and date) are skipped, so re-uploading is safe." />
      <Callout tone="info" className="mb-4" title="File format">
        Columns (header names are flexible): <code>date</code>, <code>name</code>, <code>time</code> (e.g. “5:30-7:00 PM”) or <code>start</code>/<code>end</code>, <code>location</code>, <code>category</code> (Meeting, General, Service, Mentoring, Study, Recruitment), <code>status</code> (proposed, confirmed, pending approval, cancelled), <code>notes</code>, <code>pin event name</code>.
        {" "}Templates: <a className="underline" href="/templates/events-template.csv" download>blank template</a> · <a className="underline" href="/templates/fall-2026-study-blocks.csv" download>Fall 2026 “Study with C100” blocks</a> (from the chapter calendar; Study category, not counted).
      </Callout>
      <Card><CardBody>
        <ActionForm action={importEvents} className="space-y-4">
          <Field label="Calendar file (.csv or .xlsx)" htmlFor="file"><Input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv" required /></Field>
          <SubmitButton pendingLabel="Importing…">Import events</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
