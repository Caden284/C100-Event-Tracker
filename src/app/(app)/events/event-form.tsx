import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/misc";
import { saveEvent } from "./actions";

export type EventFormValues = {
  id?: string; name?: string; event_date?: string | null; start_time?: string | null; end_time?: string | null; time_note?: string | null;
  location?: string | null; category_key?: string | null; description?: string | null; notes?: string | null; planning_status?: string;
  attendance_source?: string; semester_id?: string | null; pin_name?: string | null; counting_override?: string | null; counting_override_reason?: string | null;
};

export function EventForm({ values, categories, semesters, canOverride }: {
  values: EventFormValues; categories: { key: string; name: string; is_active: boolean }[];
  semesters: { id: string; name: string }[]; canOverride: boolean;
}) {
  const t = (v?: string | null) => (v ? v.slice(0, 5) : "");
  return (
    <ActionForm action={saveEvent} className="space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="previous_override" value={values.counting_override ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" htmlFor="name" required className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={values.name ?? ""} required maxLength={200} />
        </Field>
        <Field label="Date" htmlFor="event_date" hint="Leave empty if the date is TBD.">
          <Input id="event_date" name="event_date" type="date" defaultValue={values.event_date ?? ""} />
        </Field>
        <Field label="Category" htmlFor="category_key" hint="Decides which requirement attendance counts toward (per the semester's policy).">
          <Select id="category_key" name="category_key" defaultValue={values.category_key ?? ""}>
            <option value="">— None (counts toward nothing) —</option>
            {categories.filter((c) => c.is_active || c.key === values.category_key).map((c) => <option key={c.key} value={c.key}>{c.name}{c.is_active ? "" : " (inactive)"}</option>)}
          </Select>
        </Field>
        <Field label="Start time" htmlFor="start_time"><Input id="start_time" name="start_time" type="time" defaultValue={t(values.start_time)} /></Field>
        <Field label="End time" htmlFor="end_time"><Input id="end_time" name="end_time" type="time" defaultValue={t(values.end_time)} /></Field>
        <Field label="Time note" htmlFor="time_note" hint='e.g. "Time TBD" or "12:00 PM – until"'><Input id="time_note" name="time_note" defaultValue={values.time_note ?? ""} /></Field>
        <Field label="Location / room" htmlFor="location"><Input id="location" name="location" defaultValue={values.location ?? ""} /></Field>
        <Field label="Planning status" htmlFor="planning_status">
          <Select id="planning_status" name="planning_status" defaultValue={values.planning_status ?? "proposed"}>
            <option value="proposed">Proposed</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending_approval">Pending approval</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Attendance source" htmlFor="attendance_source">
          <Select id="attendance_source" name="attendance_source" defaultValue={values.attendance_source ?? "pin"}>
            <option value="pin">PIN scans</option>
            <option value="paper">Paper sign-in</option>
            <option value="mixed">PIN + paper</option>
            <option value="none">Not tracked</option>
          </Select>
        </Field>
        <Field label="Semester" htmlFor="semester_id" hint="Chosen automatically from the date when possible.">
          <Select id="semester_id" name="semester_id" defaultValue={values.semester_id ?? ""}>
            <option value="">— None —</option>
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="PIN event name (exact)" htmlFor="pin_name" hint="Exactly as the title appears in the PIN export. More aliases can be added on the event page.">
          <Input id="pin_name" name="pin_name" defaultValue={values.pin_name ?? ""} />
        </Field>
        <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={values.description ?? ""} /></Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} /></Field>
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Counting exception</legend>
        <p className="mb-3 text-xs text-slate-500">Normally an event counts according to its category. Use this only when the chapter explicitly approved a different rule for this event.{canOverride ? "" : " Only officers who approve policies can change it."}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Count this event as" htmlFor="counting_override">
            <Select id="counting_override" name="counting_override" defaultValue={values.counting_override ?? ""} disabled={!canOverride}>
              <option value="">Use the category (default)</option>
              <option value="none">Do not count toward any requirement</option>
              {categories.map((c) => <option key={c.key} value={c.key}>Count as {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Approval / reason" htmlFor="counting_override_reason">
            <Input id="counting_override_reason" name="counting_override_reason" defaultValue={values.counting_override_reason ?? ""} disabled={!canOverride} placeholder="e.g. Approved at Oct 6 GBM" />
          </Field>
        </div>
        {!canOverride && values.counting_override ? <input type="hidden" name="counting_override" value={values.counting_override} /> : null}
      </fieldset>
      {values.id ? (
        <Field label="Reason for this change (for the audit log)" htmlFor="change_reason"><Input id="change_reason" name="change_reason" placeholder="Optional" /></Field>
      ) : null}
      {!values.category_key && values.id ? <Callout tone="warning">This event has no category, so its attendance counts toward nothing.</Callout> : null}
      <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create event"}</SubmitButton>
    </ActionForm>
  );
}
