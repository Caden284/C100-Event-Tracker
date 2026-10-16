/**
 * Strike SUGGESTIONS calculated from the semester's membership policy.
 *
 * Nothing here records a strike. Each suggestion names the rule that produced
 * it and the evidence, and an officer confirms or dismisses it. Excused
 * absences (up to the policy's per-semester cap) protect a member from a
 * strike for that event; they never count as attendance.
 */
import { addDays, daysBetween, formatDate } from "./dates";
import type { PolicyRules } from "./policy";
import { computeProgress, type AttendanceFact } from "./progress";

export type StrikeTriggerKind = "absence" | "midterm" | "final" | "dues";

export type StrikeSuggestion = {
  member_id: string;
  trigger_key: string;      // stable per member + semester, e.g. "absence:<event id>"
  kind: StrikeTriggerKind;
  points: number;
  reason: string;           // stored on the strike record when confirmed
  event_id: string | null;
  note: string | null;      // extra context shown to the officer (not stored)
};

export type SuggestionMember = {
  member_id: string;
  person_id: string;
  status_key: string;
  email: string | null;
  member_since: string | null;
  dues: { recorded: boolean; ok: boolean } | null;
};

export type SuggestionEvent = {
  id: string;
  name: string;
  event_date: string | null;
  effective_category: string | null;
  planning_status: string;
  archived_at: string | null;
};

export type SuggestionFact = AttendanceFact & { person_id: string };

export type SuggestionInput = {
  rules: PolicyRules;
  semester: { id: string; start_date: string; end_date: string; dues_deadline: string | null };
  today: string;
  members: SuggestionMember[];
  events: SuggestionEvent[];
  facts: SuggestionFact[];
  /** trigger keys already confirmed (any strike record, even voided) or dismissed, by member */
  decided?: Map<string, Set<string>>;
};

export type SuggestionResult = {
  suggestions: StrikeSuggestion[];
  /** Past events in the absence categories with no attendance uploaded: skipped so nobody is penalized for missing data. */
  eventsWithoutAttendance: SuggestionEvent[];
  /** Members not evaluated because they have no email (PIN scans can't be matched). */
  skippedNoEmail: number;
  midtermDate: string;
  /** Held events that count toward requirements but have no attendance yet; the checkpoint waits for them. */
  midtermWaitingFor: SuggestionEvent[];
  finalWaitingFor: SuggestionEvent[];
  duesSkippedReason: string | null;
};

/** The checkpoint date: the policy's date, or the middle of the semester. */
export function midtermDate(rules: PolicyRules, semester: { start_date: string; end_date: string }): string {
  return rules.strikes.triggers.midterm_checkpoint.date
    ?? addDays(semester.start_date, Math.floor(daysBetween(semester.start_date, semester.end_date) / 2));
}

/**
 * For each member, which excused absences fall within the cap (oldest first).
 * Only excuses for events that can earn a strike count toward the cap. Excuses
 * beyond the cap are still recorded, but they no longer protect from strikes.
 */
export function excusesWithinCap(facts: SuggestionFact[], cap: number | null, categories: string[]): Map<string, { within: Set<string>; over: Set<string> }> {
  const byPerson = new Map<string, SuggestionFact[]>();
  for (const f of facts) {
    if (f.status_key !== "excused" || !f.effective_category || !categories.includes(f.effective_category)) continue;
    byPerson.set(f.person_id, [...(byPerson.get(f.person_id) ?? []), f]);
  }
  const out = new Map<string, { within: Set<string>; over: Set<string> }>();
  for (const [person, list] of byPerson) {
    list.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "") || a.event_id.localeCompare(b.event_id));
    const within = new Set<string>(), over = new Set<string>();
    list.forEach((f, i) => (cap === null || i < cap ? within : over).add(f.event_id));
    out.set(person, { within, over });
  }
  return out;
}

export function suggestStrikes(input: SuggestionInput): SuggestionResult {
  const { rules, semester, today, decided } = input;
  const t = rules.strikes.triggers;
  const cap = rules.strikes.max_excused_per_semester;
  const out: StrikeSuggestion[] = [];
  const mid = midtermDate(rules, semester);
  const tracked = input.members.filter((m) => rules.tracked_statuses.includes(m.status_key));
  const evaluated = tracked.filter((m) => !!m.email);
  const factsByPerson = new Map<string, SuggestionFact[]>();
  for (const f of input.facts) factsByPerson.set(f.person_id, [...(factsByPerson.get(f.person_id) ?? []), f]);
  const excuses = excusesWithinCap(input.facts, cap, t.unexcused_absence.categories);
  const isDecided = (memberId: string, key: string) => decided?.get(memberId)?.has(key) ?? false;
  const push = (s: StrikeSuggestion) => { if (!isDecided(s.member_id, s.trigger_key)) out.push(s); };

  // 1. Unexcused absence from a required event (e.g. a General Body Meeting).
  const eventsWithoutAttendance: SuggestionEvent[] = [];
  if (t.unexcused_absence.enabled) {
    const attendedAt = new Set(input.facts.filter((f) => f.counts_as_attended).map((f) => f.event_id));
    const required = input.events.filter((e) =>
      e.event_date && e.event_date < today && !e.archived_at && e.planning_status !== "cancelled"
      && !!e.effective_category && t.unexcused_absence.categories.includes(e.effective_category));
    for (const e of required) {
      if (!attendedAt.has(e.id)) { eventsWithoutAttendance.push(e); continue; }
      for (const m of evaluated) {
        if (m.member_since && e.event_date! < m.member_since) continue;
        const mine = factsByPerson.get(m.person_id) ?? [];
        if (mine.some((f) => f.event_id === e.id && f.counts_as_attended)) continue;
        const ex = excuses.get(m.person_id);
        if (ex?.within.has(e.id)) continue;
        const overCap = ex?.over.has(e.id) ?? false;
        push({
          member_id: m.member_id, trigger_key: `absence:${e.id}`, kind: "absence", points: t.unexcused_absence.points, event_id: e.id,
          reason: `Unexcused absence: ${e.name} (${formatDate(e.event_date)})`,
          note: overCap ? `Excused, but over the limit of ${cap} excused absence${cap === 1 ? "" : "s"} this semester.` : null,
        });
      }
    }
  }

  // 2. Behind at the midterm checkpoint, and 3. requirements unmet at the end of the semester.
  //    Both wait until every held event that counts toward a requirement has attendance,
  //    so nobody is penalized because a roster hasn't been uploaded yet.
  const counted = new Set(rules.requirements.flatMap((r) => r.categories));
  const withAttendance = new Set(input.facts.filter((f) => f.counts_as_attended).map((f) => f.event_id));
  const waitingFor = (until: string) => input.events.filter((e) =>
    e.event_date && e.event_date <= until && e.event_date < today && !e.archived_at && e.planning_status !== "cancelled"
    && !!e.effective_category && counted.has(e.effective_category) && !withAttendance.has(e.id));
  const midtermWaitingFor = t.midterm_checkpoint.enabled && today > mid ? waitingFor(mid) : [];
  const finalWaitingFor = t.end_of_semester.enabled && today > semester.end_date ? waitingFor(semester.end_date) : [];
  const progressFor = (m: SuggestionMember, until: string | null) => computeProgress(
    { status_key: m.status_key, email: m.email, member_since: m.member_since, dues_status: null },
    (factsByPerson.get(m.person_id) ?? []).filter((f) => until === null || (f.event_date ?? "") <= until),
    { ...rules, dues_required_for_good_standing: false },
  );
  if (t.midterm_checkpoint.enabled && today > mid && rules.requirements.length && !midtermWaitingFor.length) {
    for (const m of evaluated) {
      if (m.member_since && m.member_since > mid) continue;
      const p = progressFor(m, mid);
      if (p.percentComplete < t.midterm_checkpoint.min_percent) {
        push({
          member_id: m.member_id, trigger_key: "midterm", kind: "midterm", points: t.midterm_checkpoint.points, event_id: null,
          reason: `Behind at the midterm checkpoint (${formatDate(mid)}): ${p.percentComplete}% of requirements met, ${t.midterm_checkpoint.min_percent}% expected`,
          note: null,
        });
      }
    }
  }
  if (t.end_of_semester.enabled && today > semester.end_date && rules.requirements.length && !finalWaitingFor.length) {
    for (const m of evaluated) {
      const p = progressFor(m, null);
      const unmet = p.requirements.filter((r) => !r.met);
      if (unmet.length) {
        push({
          member_id: m.member_id, trigger_key: "final", kind: "final", points: t.end_of_semester.points, event_id: null,
          reason: `Requirements not met at the end of the semester: ${unmet.map((r) => `${r.label} ${r.attended}/${r.required}`).join(", ")}`,
          note: null,
        });
      }
    }
  }

  // 4. Dues not paid by the deadline. Skipped entirely until dues are being recorded,
  //    so a chapter that tracks dues elsewhere doesn't see a suggestion for everyone.
  let duesSkippedReason: string | null = null;
  if (t.dues_deadline.enabled) {
    if (!rules.dues_required_for_good_standing) duesSkippedReason = "The policy does not tie dues to good standing.";
    else if (!semester.dues_deadline) duesSkippedReason = "No dues deadline is set for this semester.";
    else if (today <= semester.dues_deadline) duesSkippedReason = `The dues deadline (${formatDate(semester.dues_deadline)}) hasn't passed.`;
    else if (!tracked.some((m) => m.dues?.recorded)) duesSkippedReason = "No dues payments are recorded for this semester yet.";
    else {
      for (const m of tracked) {
        if (m.dues?.ok) continue;
        if (m.member_since && m.member_since > semester.dues_deadline) continue;
        push({
          member_id: m.member_id, trigger_key: "dues", kind: "dues", points: t.dues_deadline.points, event_id: null,
          reason: `Dues not paid by the deadline (${formatDate(semester.dues_deadline)})`,
          note: m.dues?.recorded ? null : "No dues record for this member.",
        });
      }
    }
  }

  return { suggestions: out, eventsWithoutAttendance, skippedNoEmail: tracked.length - evaluated.length, midtermDate: mid, midtermWaitingFor, finalWaitingFor, duesSkippedReason };
}

export const TRIGGER_LABELS: Record<StrikeTriggerKind, string> = {
  absence: "Unexcused absence",
  midterm: "Midterm checkpoint",
  final: "End of semester",
  dues: "Dues deadline",
};
