import "server-only";
import type { SessionContext } from "@/lib/auth";
import type { Semester } from "@/lib/data/semesters";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadStanding } from "@/lib/data/roster";
import { suggestStrikes } from "@/lib/domain/strikes";

export type AbsenceReason = { key: string; name: string; description: string | null; requires_note: boolean; is_active: boolean; sort_order: number };

export async function loadAbsenceReasons(s: SessionContext, includeInactive = false): Promise<AbsenceReason[]> {
  let q = s.supabase.from("absence_reasons").select("key, name, description, requires_note, is_active, sort_order").order("sort_order");
  if (!includeInactive) q = q.eq("is_active", true);
  return (await q).data ?? [];
}

export type AbsenceRow = {
  record_id: string;
  event_id: string;
  event_name: string;
  event_date: string | null;
  category_key: string | null;
  person_id: string;
  member_id: string | null;
  name: string;
  excused: boolean;
  reason_key: string | null;  // null when the viewer may not see reasons
  note: string | null;
  recorded_at: string;
};

/** Excused and unexcused absences recorded in a semester. Reasons only for officers allowed to see them. */
export async function loadAbsences(s: SessionContext, semesterId: string, opts: { personId?: string } = {}): Promise<{ rows: AbsenceRow[]; canSeeReasons: boolean }> {
  if (!s.can("attendance.read")) return { rows: [], canSeeReasons: false };
  const canSeeReasons = s.can("attendance.excuse") || s.can("members.notes");
  const recs = await fetchAll((from, to) => {
    let q = s.supabase.from("v_attendance_detail")
      .select("id, event_id, event_name, event_date, category_key, person_id, member_id, first_name, last_name, status_key, created_at")
      .eq("semester_id", semesterId).in("status_key", ["excused", "absent"]);
    if (opts.personId) q = q.eq("person_id", opts.personId);
    return q.order("event_date", { ascending: false }).order("id").range(from, to);
  });
  const excuses = new Map<string, { reason_key: string; note: string | null; recorded_at: string }>();
  if (canSeeReasons && recs.length) {
    const ids = recs.filter((r) => r.status_key === "excused").map((r) => r.id!);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await s.supabase.from("absence_excuses").select("attendance_record_id, reason_key, note, recorded_at").in("attendance_record_id", ids.slice(i, i + 200));
      for (const e of data ?? []) excuses.set(e.attendance_record_id, e);
    }
  }
  return {
    canSeeReasons,
    rows: recs.map((r) => {
      const ex = excuses.get(r.id!);
      return {
        record_id: r.id!, event_id: r.event_id!, event_name: r.event_name!, event_date: r.event_date, category_key: r.category_key,
        person_id: r.person_id!, member_id: r.member_id, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "(no name)",
        excused: r.status_key === "excused", reason_key: ex?.reason_key ?? null, note: ex?.note ?? null, recorded_at: ex?.recorded_at ?? r.created_at!,
      };
    }),
  };
}

/** Strike suggestions for the semester, minus those already confirmed or dismissed. */
export async function loadStrikeSuggestions(s: SessionContext, semester: Semester | null) {
  const standing = await loadStanding(s, semester);
  if (!semester || !s.can("discipline.read")) return { ...standing, result: null };
  const [strikes, dismissals] = await Promise.all([
    s.supabase.from("strike_records").select("member_id, trigger_key").eq("semester_id", semester.id).not("trigger_key", "is", null),
    s.supabase.from("strike_dismissals").select("member_id, trigger_key").eq("semester_id", semester.id),
  ]);
  const decided = new Map<string, Set<string>>();
  for (const r of [...(strikes.data ?? []), ...(dismissals.data ?? [])]) {
    if (!r.trigger_key) continue;
    decided.set(r.member_id, (decided.get(r.member_id) ?? new Set()).add(r.trigger_key));
  }
  const result = suggestStrikes({
    rules: standing.rules,
    semester: { id: semester.id, start_date: semester.start_date, end_date: semester.end_date, dues_deadline: semester.dues_deadline },
    today: standing.today,
    members: standing.members,
    events: standing.events,
    facts: standing.facts,
    decided,
  });
  return { ...standing, result };
}
