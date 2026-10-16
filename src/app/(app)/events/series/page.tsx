import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createSeries } from "../actions";

export const metadata = { title: "Recurring series" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SeriesPage() {
  const s = await requirePermission("events.write");
  const { data: cats } = await s.supabase.from("event_categories").select("key, name, is_active").order("sort_order");
  return (
    <>
      <PageHeader title="Create a recurring series" back={{ href: "/events", label: "Events" }}
        description="Event template for recurring programming — e.g. the weekly “Study with C100” block or monthly General Body Meetings. Each date becomes its own event that can be moved or edited individually." />
      <Card><CardBody>
        <ActionForm action={createSeries} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required className="sm:col-span-2"><Input id="name" name="name" required placeholder="Study with C100" /></Field>
            <Field label="First date" htmlFor="from" required><Input id="from" name="from" type="date" required /></Field>
            <Field label="Last date" htmlFor="to" required><Input id="to" name="to" type="date" required /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-xs font-medium text-slate-700">Repeats on</legend>
              <div className="mt-1 flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="weekday" value={i} className="h-4 w-4" />{d}</label>)}</div>
            </fieldset>
            <Field label="Skip these dates" htmlFor="skip" hint="Comma-separated, e.g. 2026-11-26, 2026-10-06" className="sm:col-span-2"><Input id="skip" name="skip" /></Field>
            <Field label="Start time" htmlFor="start_time"><Input id="start_time" name="start_time" type="time" /></Field>
            <Field label="End time" htmlFor="end_time"><Input id="end_time" name="end_time" type="time" /></Field>
            <Field label="Location" htmlFor="location"><Input id="location" name="location" /></Field>
            <Field label="Category" htmlFor="category_key">
              <Select id="category_key" name="category_key" defaultValue="">
                <option value="">— None —</option>
                {(cats ?? []).filter((c) => c.is_active).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Planning status" htmlFor="planning_status">
              <Select id="planning_status" name="planning_status" defaultValue="proposed">
                <option value="proposed">Proposed</option><option value="confirmed">Confirmed</option><option value="pending_approval">Pending approval</option>
              </Select>
            </Field>
            <Field label="Attendance source" htmlFor="attendance_source">
              <Select id="attendance_source" name="attendance_source" defaultValue="pin">
                <option value="pin">PIN scans</option><option value="paper">Paper</option><option value="none">Not tracked</option>
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" /></Field>
          </div>
          <SubmitButton>Create series</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
