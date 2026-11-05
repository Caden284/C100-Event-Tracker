import "server-only";
import type { SessionContext } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { displayName } from "@/lib/domain/normalize";
import { parseIntakeConfig, type IntakeConfig } from "@/lib/domain/interviews";

export type IntakeCycle = {
  id: string; name: string; status: "setup" | "interviewing" | "deliberation" | "closed"; spots: number;
  engagement_cutoff: string | null; engagement_counted_at: string | null; decisions_by: string | null;
  dues_amount_cents: number | null; dues_due: string | null; deliberation_opened_at: string | null;
  semester_id: string | null; config: IntakeConfig;
};

export type ApplicantRow = {
  id: string; person_id: string; name: string; first_name: string | null; email: string | null;
  group_label: string | null; tier: string | null; classification: string | null; major: string | null;
  gpa: number | null; hours_offered: string | null; events_reported: number | null;
  engagement_events: number | null; engagement_points: number | null;
  interviewer_id: string | null; interviewer_name: string | null;
  slot_at: string | null; slot_note: string | null; status: string;
  decision: string | null; waitlist_rank: number | null; decision_note: string | null;
};

export type ScoreRow = {
  id: string; applicant_id: string; interviewer_id: string; scores: Record<string, number>; answers: Record<string, string>;
  own_question: string | null; own_notes: string | null; recommendation: string | null; red_flag: boolean;
  red_flag_note: string | null; notes: string | null; submitted_at: string | null; updated_at: string;
};

/** The open intake (most recent that isn't closed), or the most recent one. */
export async function loadCurrentCycle(s: SessionContext): Promise<IntakeCycle | null> {
  const { data } = await s.supabase.from("intake_cycles").select("*").order("created_at", { ascending: false }).limit(5);
  const pick = (data ?? []).find((c) => c.status !== "closed") ?? data?.[0];
  return pick ? { ...(pick as unknown as IntakeCycle), config: parseIntakeConfig(pick.config) } : null;
}

export async function loadCycle(s: SessionContext, id: string): Promise<IntakeCycle | null> {
  const { data } = await s.supabase.from("intake_cycles").select("*").eq("id", id).maybeSingle();
  return data ? { ...(data as unknown as IntakeCycle), config: parseIntakeConfig(data.config) } : null;
}

/** How the officer introduces themselves: their e-board role from the roster, else their hub role. */
export async function officerRole(s: SessionContext): Promise<string | null> {
  const { data } = await s.supabase.from("v_people_directory").select("eboard_role").eq("email", s.email.toLowerCase()).not("member_id", "is", null).limit(1);
  const role = data?.[0]?.eboard_role;
  if (role) return role;
  const key = s.roles.find((r) => r !== "super_admin") ?? null;
  return key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

export async function loadApplicants(s: SessionContext, cycleId: string, opts: { id?: string } = {}): Promise<ApplicantRow[]> {
  const rows = await fetchAll((from, to) => {
    let q = s.supabase.from("intake_applicants")
      .select("*, people(first_name, last_name, preferred_name), interviewer:profiles!intake_applicants_interviewer_id_fkey(full_name, email)")
      .eq("cycle_id", cycleId);
    if (opts.id) q = q.eq("id", opts.id);
    return q.order("slot_at", { ascending: true, nullsFirst: false }).order("id").range(from, to);
  });
  const personIds = rows.map((r) => r.person_id);
  const emails = new Map<string, string>();
  for (let i = 0; i < personIds.length; i += 200) {
    const { data } = await s.supabase.from("v_people_directory").select("person_id, email").in("person_id", personIds.slice(i, i + 200));
    for (const d of data ?? []) if (d.email) emails.set(d.person_id!, d.email);
  }
  return rows.map((r) => {
    const p = r.people as { first_name: string | null; last_name: string | null; preferred_name: string | null };
    const iv = r.interviewer as { full_name: string | null; email: string } | null;
    return {
      id: r.id, person_id: r.person_id, name: displayName(p), first_name: p.preferred_name || p.first_name, email: emails.get(r.person_id) ?? null,
      group_label: r.group_label, tier: r.tier, classification: r.classification, major: r.major, gpa: r.gpa,
      hours_offered: r.hours_offered, events_reported: r.events_reported, engagement_events: r.engagement_events,
      engagement_points: r.engagement_points, interviewer_id: r.interviewer_id, interviewer_name: iv ? iv.full_name || iv.email : null,
      slot_at: r.slot_at, slot_note: r.slot_note, status: r.status, decision: r.decision, waitlist_rank: r.waitlist_rank, decision_note: r.decision_note,
    };
  });
}

/** Score rows this officer may see: their own, or everyone's once deliberation opens (enforced by RLS). */
export async function loadScores(s: SessionContext, applicantIds: string[]): Promise<ScoreRow[]> {
  const out: ScoreRow[] = [];
  for (let i = 0; i < applicantIds.length; i += 200) {
    const { data } = await s.supabase.from("interview_scores").select("*").in("applicant_id", applicantIds.slice(i, i + 200));
    out.push(...((data ?? []) as unknown as ScoreRow[]));
  }
  return out;
}

/** Officers who can be assigned interviews (anyone with an active login and a role). */
export async function loadInterviewers(s: SessionContext): Promise<{ id: string; name: string }[]> {
  const { data } = await s.supabase.from("user_roles").select("user_id, profiles!user_roles_user_id_fkey(full_name, email, is_active)");
  const seen = new Map<string, string>();
  for (const r of data ?? []) {
    const p = r.profiles as { full_name: string | null; email: string; is_active: boolean } | null;
    if (p?.is_active && !seen.has(r.user_id)) seen.set(r.user_id, p.full_name || p.email);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadProgress(s: SessionContext, cycleId: string) {
  const { data } = await s.supabase.rpc("intake_progress", { p_cycle: cycleId });
  return (data ?? []) as { interviewer_id: string | null; interviewer_name: string; assigned: number; completed: number; no_show: number; submitted: number }[];
}
