import "server-only";
import type { SessionContext } from "@/lib/auth";
import type { Semester } from "@/lib/data/semesters";
import { fetchAll } from "@/lib/data/fetch-all";
import { getSetting } from "@/lib/data/settings";
import { todayIso } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { parseRules, type PolicyRules } from "@/lib/domain/policy";
import { computeProgress, scheduledRemainingByCategory, type AttendanceFact, type ProgressResult } from "@/lib/domain/progress";

export type PolicyInfo = { id: string; name: string; version: number; status: "draft" | "approved" | "retired"; approved_at: string | null } | null;

export type FactRow = AttendanceFact & {
  person_id: string; member_id: string | null; prospect_id: string | null; event_name: string; category_key: string | null; source: string;
};

export type RosterMember = {
  member_id: string;
  person_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status_key: string;
  eboard_role: string | null;
  committee: string | null;
  member_since: string | null;
  dues: { recorded: boolean; ok: boolean } | null;
  progress: ProgressResult;
};

export type SemesterEvent = {
  id: string; name: string; event_date: string | null; category_key: string | null; effective_category: string | null;
  planning_status: string; archived_at: string | null; semester_id: string | null;
};

export async function loadPolicy(s: SessionContext, semester: Semester | null): Promise<{ policy: PolicyInfo; rules: PolicyRules }> {
  if (!semester?.policy_id || !(s.can("standing.read") || s.can("policies.read"))) return { policy: null, rules: parseRules({ requirements: [] }) };
  const { data } = await s.supabase
    .from("membership_policies")
    .select("id, name, version, status, approved_at, rules")
    .eq("id", semester.policy_id)
    .maybeSingle();
  if (!data) return { policy: null, rules: parseRules({ requirements: [] }) };
  return { policy: { id: data.id, name: data.name, version: data.version, status: data.status as "draft", approved_at: data.approved_at }, rules: parseRules(data.rules) };
}

export async function loadSemesterEvents(s: SessionContext, semesterId: string): Promise<SemesterEvent[]> {
  if (!s.can("events.read")) return [];
  const rows = await fetchAll((from, to) =>
    s.supabase
      .from("events")
      .select("id, name, event_date, category_key, counting_override, planning_status, archived_at, semester_id")
      .eq("semester_id", semesterId)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
  return rows.map((e) => ({
    ...e,
    effective_category: e.counting_override === "none" ? null : (e.counting_override ?? e.category_key),
  }));
}

export async function loadFacts(s: SessionContext, semesterId: string): Promise<FactRow[]> {
  if (!s.can("attendance.read")) return [];
  const rows = await fetchAll((from, to) =>
    s.supabase
      .from("v_attendance_detail")
      .select("id, event_id, person_id, status_key, source, counts_as_attended, event_name, event_date, category_key, effective_category, member_id, prospect_id")
      .eq("semester_id", semesterId)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    event_id: r.event_id!, person_id: r.person_id!, status_key: r.status_key!, source: r.source!,
    counts_as_attended: !!r.counts_as_attended, event_name: r.event_name!, event_date: r.event_date,
    category_key: r.category_key, effective_category: r.effective_category, member_id: r.member_id, prospect_id: r.prospect_id,
  }));
}

/** Everything needed to show progress / calculated standing for a semester. */
export async function loadStanding(s: SessionContext, semester: Semester | null) {
  const today = todayIso();
  const { policy, rules } = await loadPolicy(s, semester);
  if (!semester || !s.can("members.read")) {
    return { policy, rules, members: [] as RosterMember[], facts: [] as FactRow[], events: [] as SemesterEvent[], today };
  }
  const [people, facts, events, duesRes, atRisk] = await Promise.all([
    fetchAll((from, to) =>
      s.supabase
        .from("v_people_directory")
        .select("person_id, member_id, first_name, last_name, preferred_name, email, status_key, eboard_role, committee, member_since")
        .not("member_id", "is", null)
        .order("person_id")
        .range(from, to),
    ),
    loadFacts(s, semester.id),
    loadSemesterEvents(s, semester.id),
    s.can("standing.read") || s.can("dues.read") ? s.supabase.rpc("member_dues_ok", { p_semester: semester.id }) : Promise.resolve({ data: null }),
    getSetting(s.supabase, "at_risk"),
  ]);
  const dues = new Map<string, { recorded: boolean; ok: boolean }>();
  for (const d of (duesRes.data ?? []) as { member_id: string; dues_recorded: boolean; dues_ok: boolean }[]) {
    dues.set(d.member_id, { recorded: d.dues_recorded, ok: d.dues_ok });
  }
  const factsByPerson = new Map<string, FactRow[]>();
  for (const f of facts) factsByPerson.set(f.person_id, [...(factsByPerson.get(f.person_id) ?? []), f]);
  const scheduled = scheduledRemainingByCategory(events, today);

  const members: RosterMember[] = people.map((p) => {
    const d = dues.get(p.member_id!) ?? null;
    const progress = computeProgress(
      {
        status_key: p.status_key!,
        email: p.email,
        member_since: p.member_since,
        dues_status: d ? (d.recorded ? (d.ok ? "paid" : "unpaid") : null) : null,
      },
      factsByPerson.get(p.person_id!) ?? [],
      rules,
      { semester, today, scheduledRemaining: scheduled, behindPaceMargin: atRisk.behind_pace_margin },
    );
    return {
      member_id: p.member_id!, person_id: p.person_id!, name: displayName(p), first_name: p.first_name, last_name: p.last_name,
      email: p.email, status_key: p.status_key!, eboard_role: p.eboard_role, committee: p.committee, member_since: p.member_since,
      dues: d, progress,
    };
  });
  members.sort((a, b) => (a.last_name ?? a.first_name ?? "").localeCompare(b.last_name ?? b.first_name ?? "") || a.name.localeCompare(b.name));
  return { policy, rules, members, facts, events, today };
}
