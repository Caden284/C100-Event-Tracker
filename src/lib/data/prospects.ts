import "server-only";
import type { SessionContext } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { getSetting } from "@/lib/data/settings";
import { displayName } from "@/lib/domain/normalize";
import { prospectEngagement, type ProspectEngagement } from "@/lib/domain/recognition";

export type ProspectRow = {
  id: string; person_id: string; name: string; first_name: string | null; last_name: string | null; email: string | null;
  status: string; follow_up_status: string; interest_override: string | null; first_seen_text: string | null; first_seen_event_id: string | null;
  semester_id: string | null; assigned_officer_id: string | null; next_steps: string | null; notes: string | null; converted_member_id: string | null;
  engagement: ProspectEngagement; interest: "high" | "medium" | "low"; recruitmentEvents: number;
};

export async function loadProspects(s: SessionContext): Promise<ProspectRow[]> {
  if (!s.can("prospects.read")) return [];
  const [rows, emails, facts, settings] = await Promise.all([
    fetchAll((from, to) =>
      s.supabase.from("prospective_members")
        .select("id, person_id, status, follow_up_status, interest_override, first_seen_text, first_seen_event_id, semester_id, assigned_officer_id, next_steps, notes, converted_member_id, people(first_name, last_name, preferred_name)")
        .order("id").range(from, to)),
    fetchAll((from, to) => s.supabase.from("v_people_directory").select("person_id, email").not("prospect_id", "is", null).order("person_id").range(from, to)),
    s.can("attendance.read")
      ? fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("person_id, event_date, counts_as_attended, category_key").not("prospect_id", "is", null).order("id").range(from, to))
      : Promise.resolve([] as { person_id: string | null; event_date: string | null; counts_as_attended: boolean | null; category_key: string | null }[]),
    getSetting(s.supabase, "prospect_engagement"),
  ]);
  const emailBy = new Map(emails.map((e) => [e.person_id, e.email]));
  const factsBy = new Map<string, { event_date: string | null; counts_as_attended: boolean; category_key: string | null }[]>();
  for (const f of facts) {
    if (!f.person_id) continue;
    factsBy.set(f.person_id, [...(factsBy.get(f.person_id) ?? []), { event_date: f.event_date, counts_as_attended: !!f.counts_as_attended, category_key: f.category_key }]);
  }
  return rows.map((r) => {
    const p = (r.people ?? {}) as { first_name: string | null; last_name: string | null; preferred_name: string | null };
    const f = factsBy.get(r.person_id) ?? [];
    const engagement = prospectEngagement(f, settings);
    return {
      ...r, name: displayName(p), first_name: p.first_name, last_name: p.last_name, email: emailBy.get(r.person_id) ?? null,
      engagement, interest: (r.interest_override as "high" | "medium" | "low" | null) ?? engagement.interest,
      recruitmentEvents: f.filter((x) => x.counts_as_attended && x.category_key === "recruitment").length,
    };
  }).sort((a, b) => b.engagement.eventsAttended - a.engagement.eventsAttended || a.name.localeCompare(b.name));
}
