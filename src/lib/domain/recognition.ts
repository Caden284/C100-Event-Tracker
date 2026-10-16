/**
 * Recognition helpers: prospect engagement indicators, eligibility checks and a
 * FAIR "most improved" comparison. None of these decide an award — they inform
 * officers, who nominate, vote and approve.
 */

export type EngagementSettings = { high_min_events: number; medium_min_events: number };

export type ProspectEngagement = {
  eventsAttended: number;
  interest: "high" | "medium" | "low";
  firstSeen: string | null;
  lastSeen: string | null;
  distinctMonths: number;
};

/** Workbook rule (Prospective Members!E): 3+ → High, 2 → Medium, else Low. Indicators, not judgments. */
export function prospectEngagement(
  attended: { event_date: string | null; counts_as_attended: boolean }[],
  s: EngagementSettings,
): ProspectEngagement {
  const valid = attended.filter((a) => a.counts_as_attended);
  const dates = valid.map((a) => a.event_date).filter((d): d is string => !!d).sort();
  const n = valid.length;
  return {
    eventsAttended: n,
    interest: n >= s.high_min_events ? "high" : n >= s.medium_min_events ? "medium" : "low",
    firstSeen: dates[0] ?? null,
    lastSeen: dates[dates.length - 1] ?? null,
    distinctMonths: new Set(dates.map((d) => d.slice(0, 7))).size,
  };
}

export type EligibilityRule = Record<string, number | string[] | null | string | boolean | undefined>;

export type CandidateStats = {
  countedEvents: number;
  categoriesAttended: number;
  eventsAttended: number;
  distinctMonths: number;
  memberStatus?: string | null;
};

export type EligibilityResult = { eligible: boolean; configured: boolean; reasons: string[] };

export function evaluateEligibility(audience: "member" | "prospect", rules: EligibilityRule, s: CandidateStats): EligibilityResult {
  const reasons: string[] = [];
  let eligible = true;
  let configured = false;
  const num = (k: string) => (typeof rules[k] === "number" ? (rules[k] as number) : null);
  const check = (label: string, value: number, min: number | null) => {
    if (min === null) return;
    configured = true;
    if (value >= min) reasons.push(`✓ ${label}: ${value} (minimum ${min})`);
    else {
      eligible = false;
      reasons.push(`✗ ${label}: ${value} (minimum ${min})`);
    }
  };
  if (audience === "member") {
    const statuses = Array.isArray(rules.require_member_status) ? (rules.require_member_status as string[]) : null;
    if (statuses && statuses.length) {
      configured = true;
      if (!s.memberStatus || !statuses.includes(s.memberStatus)) {
        eligible = false;
        reasons.push(`✗ Membership status must be ${statuses.join(" or ")}`);
      } else reasons.push(`✓ Membership status ${s.memberStatus}`);
    }
    check("Counted events", s.countedEvents, num("min_counted_events"));
    check("Event categories attended", s.categoriesAttended, num("min_categories_attended"));
  } else {
    check("Events attended", s.eventsAttended, num("min_events_attended"));
    check("Months with participation", s.distinctMonths, num("min_distinct_months"));
  }
  if (!configured) reasons.push("No eligibility thresholds configured yet — all candidates are listed for officer review.");
  return { eligible, configured, reasons };
}

export type PeriodStats = { attended: number; available: number };

export type Improvement = {
  eligible: boolean;
  previousRate: number | null;
  currentRate: number | null;
  delta: number | null;
  explanation: string;
};

/**
 * Compares attendance RATES (attended ÷ counted events available), not raw counts,
 * so semesters with different numbers of events are comparable. Members without a
 * fair baseline (new members, too few prior events) are not ranked.
 */
export function improvement(prev: PeriodStats | null, curr: PeriodStats, minBaselineEvents = 3): Improvement {
  if (curr.available === 0) {
    return { eligible: false, previousRate: null, currentRate: null, delta: null, explanation: "No counted events held yet this semester." };
  }
  const currentRate = curr.attended / curr.available;
  if (!prev) {
    return { eligible: false, previousRate: null, currentRate, delta: null, explanation: "No prior semester baseline (new member or no history) — not compared." };
  }
  if (prev.available < minBaselineEvents) {
    return {
      eligible: false, previousRate: null, currentRate, delta: null,
      explanation: `Prior semester had only ${prev.available} counted event(s); at least ${minBaselineEvents} are needed for a fair comparison.`,
    };
  }
  const previousRate = prev.attended / prev.available;
  const delta = currentRate - previousRate;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return {
    eligible: true, previousRate, currentRate, delta,
    explanation: `Attendance rate ${pct(previousRate)} → ${pct(currentRate)} (${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} points), based on ${prev.available} and ${curr.available} available events.`,
  };
}

/** Standard competition ranking ("1, 2, 2, 4") for leaderboards. */
export function rank<T>(items: T[], score: (t: T) => number): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((t, i) => {
    const s = score(t);
    const r = lastScore === s ? lastRank : i + 1;
    lastScore = s;
    lastRank = r;
    return { ...t, rank: r };
  });
}
