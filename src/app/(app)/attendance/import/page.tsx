import { requirePermission } from "@/lib/auth";
import { getSetting } from "@/lib/data/settings";
import { Callout, PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { formatDate } from "@/lib/domain/dates";
import { uploadImport } from "./actions";

export const metadata = { title: "Import PIN attendance" };

export default async function UploadPage({ searchParams }: PageProps<"/attendance/import">) {
  const params = await searchParams;
  const s = await requirePermission("attendance.import");
  const limits = await getSetting(s.supabase, "import_limits");
  const { data: events } = await s.supabase.from("events").select("id, name, event_date").is("archived_at", null).not("event_date", "is", null).order("event_date", { ascending: false }).limit(200);
  const preset = typeof params.event === "string" ? params.event : "";
  return (
    <>
      <PageHeader title="Import PIN attendance" back={{ href: "/attendance", label: "Attendance" }}
        description="Step 1 of 4 · Upload the export from Panther Involvement Network. Nothing is recorded until you review the preview and commit." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Upload an export" description={`CSV or .xlsx · up to ${limits.max_file_mb} MB and ${limits.max_rows.toLocaleString()} rows · checked by content, not just the file name`} />
          <CardBody>
            <ActionForm action={uploadImport} className="space-y-4">
              <Field label="PIN attendance export" htmlFor="file" required>
                <Input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
              </Field>
              <Field label="Event (optional)" htmlFor="event_id" hint="If the export is for one event and has no event-name column, choose it here. You can also choose in the next step.">
                <Select id="event_id" name="event_id" defaultValue={preset}>
                  <option value="">Detect from the file</option>
                  {(events ?? []).map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} — {e.name}</option>)}
                </Select>
              </Field>
              <SubmitButton pendingLabel="Reading file…">Upload and detect columns</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Troubleshooting" />
          <CardBody className="space-y-2 text-sm text-slate-600">
            <p><strong>Getting the export:</strong> in PIN open the event → Attendance → Export (“Event Attendance By Event”). CSV is best.</p>
            <p><strong>Uploaded twice?</strong> Safe. Each person can only have one record per event, so duplicates are skipped and explained.</p>
            <p><strong>Columns not recognized?</strong> You can map them by hand in the next step.</p>
            <p><strong>Old .xls file?</strong> Open it in Excel and save as .xlsx or CSV.</p>
            <p><strong>People not found?</strong> They go to the unmatched-scan queue. Nobody is matched on name alone.</p>
          </CardBody>
        </Card>
      </div>
      <Callout tone="info" className="mt-4">This app does not connect to PIN directly — you download the export from PIN and upload it here.</Callout>
    </>
  );
}
