import "server-only";
import type { SessionContext } from "@/lib/auth";
import type { Semester } from "@/lib/data/semesters";
import { loadFacts, loadStanding } from "@/lib/data/roster";
import { loadProspects } from "@/lib/data/prospects";
import { todayIso } from "@/lib/domain/dates";
import { countedCategories, parseRules } from "@/lib/domain/policy";
import { evaluateEligibility, improvement, type EligibilityRule } from "@/lib/domain/recognition";

export type Candidate = {
  person_id: string; name: string; email: string | null; href: string; eligible: boolean; configured: boolean; reasons: string[]; score: number; detail: string;
};

/** Calculated eligibility for one award category in one semester. Informational only. */
export async function candidatesFor(
  s: SessionContext,
  category: { key: string; audience: string; eligibility_rules: unknown },
  semester: Semester,
  allSemesters: Semester[],
): Promise<Candidate[]> {
  const rules = (category.eligibility_rules ?? {}) as EligibilityRule;
  if (category.audience === "prospect") {
    const [prospects, facts] = await Promise.all([loadProspects(s), loadFacts(s, semester.id)]);
    const bySem = new Map<string, { n: number; months: Set<string> }>();
    for (const f of facts) {
      if (!f.prospect_id || f.member_id || !f.counts_as_attended) continue;
      const x = bySem.get(f.person_id) ?? { n: 0, months: new Set() };
      x.n++;
      if (f.event_date) x.months.add(f.event_date.slice(0, 7));
      bySem.set(f.person_id, x);
    }
    return prospects.filter((p) => p.status === "in_recruitment" || bySem.has(p.person_id)).map((p) => {
      const st = bySem.get(p.person_id) ?? { n: 0, months: new Set<string>() };
      const e = evaluateEligibility("prospect", rules, { countedEvents: 0, categoriesAttended: 0, eventsAttended: st.n, distinctMonths: st.months.size });
      return { person_id: p.person_id, name: p.name, email: p.email, href: `/prospects/${p.id}`, ...e, score: st.n, detail: `${st.n} event(s) this semester across ${st.months.size} month(s)` };
    }).sort((a, b) => b.score - a.score);
  }

  const { members, rules: policyRules, facts } = await loadStanding(s, semester);
  if (category.key === "most_improved_member" || rules.comparison === "previous_semester") {
    const ordered = [...allSemesters].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const prev = ordered[ordered.findIndex((x) => x.id === semester.id) - 1];
    const today = todayIso();
    const counted = countedCategories(policyRules);
    const available = (fs: typeof facts, upto: string) => new Set(fs.filter((f) => f.effective_category && counted.has(f.effective_category) && (f.event_date ?? "") <= upto).map((f) => f.event_id)).size;
    const currAvail = available(facts, today);
    let prevFacts: typeof facts = [];
    let prevAvail = 0;
    let prevCounted = counted;
    if (prev) {
      prevFacts = await loadFacts(s, prev.id);
      if (prev.policy_id) {
        const { data } = await s.supabase.from("membership_policies").select("rules").eq("id", prev.policy_id).maybeSingle();
        if (data) prevCounted = countedCategories(parseRules(data.rules));
      }
      prevAvail = new Set(prevFacts.filter((f) => f.effective_category && prevCounted.has(f.effective_category)).map((f) => f.event_id)).size;
    }
    return members.filter((m) => m.status_key === "active").map((m) => {
      const curr = { attended: m.progress.totalCounted, available: currAvail };
      const hadPrev = prev && (!m.member_since || m.member_since <= prev.end_date);
      const prevAtt = new Set(prevFacts.filter((f) => f.person_id === m.person_id && f.counts_as_attended && f.effective_category && prevCounted.has(f.effective_category)).map((f) => f.event_id)).size;
      const imp = improvement(hadPrev ? { attended: prevAtt, available: prevAvail } : null, curr, typeof rules.min_baseline_events === "number" ? rules.min_baseline_events : 3);
      return { person_id: m.person_id, name: m.name, email: m.email, href: `/members/${m.member_id}`, eligible: imp.eligible, configured: true, reasons: [imp.explanation], score: imp.delta ?? -1, detail: imp.explanation };
    }).sort((a, b) => b.score - a.score);
  }

  return members.filter((m) => !["removed", "graduated"].includes(m.status_key)).map((m) => {
    const cats = new Set(facts.filter((f) => f.person_id === m.person_id && f.counts_as_attended && f.effective_category).map((f) => f.effective_category));
    const e = evaluateEligibility("member", rules, { countedEvents: m.progress.totalCounted, categoriesAttended: cats.size, eventsAttended: 0, distinctMonths: 0, memberStatus: m.status_key });
    return { person_id: m.person_id, name: m.name, email: m.email, href: `/members/${m.member_id}`, ...e, score: m.progress.totalCounted,
      detail: `${m.progress.totalCounted} counted event(s) in ${cats.size} categor${cats.size === 1 ? "y" : "ies"}${m.progress.isStandout ? " · Standout" : ""}` };
  }).sort((a, b) => b.score - a.score);
}
