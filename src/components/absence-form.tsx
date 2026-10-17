import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { formatDate } from "@/lib/domain/dates";
import type { AbsenceReason } from "@/lib/data/absences";
import { recordAbsence } from "@/app/(app)/attendance/absences/actions";

type Option = { id: string; label: string };

/**
 * Records an excused or unexcused absence. Pass a fixed event or member to hide
 * that picker (e.g. on an event page), or lists to choose from.
 */
export function AbsenceForm({ reasons, event, events, member, members, compact = false, idPrefix = "ab" }: {
  reasons: AbsenceReason[];
  event?: { id: string };
  events?: { id: string; name: string; event_date: string | null }[];
  member?: { member_id: string; person_id: string };
  members?: Option[]; // id = person_id
  compact?: boolean;
  idPrefix?: string;
}) {
  const size = compact ? "h-8 text-xs" : "";
  return (
    <ActionForm action={recordAbsence} resetOnSuccess className={compact ? "space-y-2" : "space-y-3"}>
      {event ? <input type="hidden" name="event_id" value={event.id} /> : null}
      {member ? <><input type="hidden" name="person_id" value={member.person_id} /><input type="hidden" name="member_id" value={member.member_id} /></> : null}
      {!member && members ? (
        <Field label="Member" htmlFor={`${idPrefix}-member`}>
          <Select id={`${idPrefix}-member`} name="person_id" required defaultValue="" className={size}>
            <option value="" disabled>Choose a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
      ) : null}
      {!event && events ? (
        <Field label="Event" htmlFor={`${idPrefix}-event`}>
          <Select id={`${idPrefix}-event`} name="event_id" required defaultValue="" className={size}>
            <option value="" disabled>Choose an event…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
          </Select>
        </Field>
      ) : null}
      <fieldset>
        <legend className="text-xs font-medium text-slate-700">Absence</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="excused" defaultChecked required /> Excused</label>
          <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="unexcused" /> Unexcused</label>
        </div>
      </fieldset>
      <Field label="Reason (for excused absences)" htmlFor={`${idPrefix}-reason`}>
        <Select id={`${idPrefix}-reason`} name="reason_key" defaultValue="" className={size}>
          <option value="">Choose a reason…</option>
          {reasons.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Note (optional)" htmlFor={`${idPrefix}-note`} hint="Required for “Other”. Don't record medical or personal details.">
        <Input id={`${idPrefix}-note`} name="note" maxLength={500} className={size} />
      </Field>
      <SubmitButton size={compact ? "sm" : undefined}>Record absence</SubmitButton>
    </ActionForm>
  );
}
