/**
 * Attendance progress and CALCULATED standing for one member in one semester.
 *
 * This is a calculation, not a decision. It never places anyone on warning or
 * probation; it explains exactly why a member shows a given calculated standing.
 *
 * Workbook logic preserved (Members!O):
 *   No email      → can't be tracked reliably until an email is added
 *   Good Standing → every requirement met AND dues paid (if dues are required)
 *   Standout      → total counted attendance ≥ multiplier × combined requirement (1.5 × 11 = 17)
 *   In Progress   → anything else
 * Difference from the workbook: Standout is reported as a separate badge, so a
 * member can be both "Good Standing" and "Standout".
 */
import { daysBetween } from "./dates";
import { combinedRequirement, type PolicyRules, requirementForCategory, standoutThreshold } from "./policy";

export type AttendanceFact = {
  event_id: string;
  event_date: string | null;
  effective_category: string | null;
  counts_as_attended: boolean;
  status_key: string;
};

export type MemberFacts = {
  status_key: string;
  email: string | null;
  member_since: string | null;
  dues_status: "paid" | "unpaid" | "partial" | "waived" | null; // null = not recorded
};

export type SemesterWindow = { start_date: string; end_date: string };

export type RequirementProgress = {
  key: string;
  label: string;
  required: number;
  attended: number;
  met: boolean;
  remaining: number;
  scheduledRemaining: number | null;
  canStillMeet: boolean | null;
};

export type CalculatedStanding = "good_standing" | "in_progress" | "no_email" | "not_tracked";

export type ProgressResult = {
  requirements: RequirementProgress[];
  totalCounted: number;
  combinedRequired: number;
  standoutThreshold: number | null;
  isStandout: boolean;
  standing: CalculatedStanding;
  reasons: string[];
  warnings: string[];
  behindPace: boolean;
  needsAttention: boolean;
  percentComplete: number;
  excludedBeforeMembership: number;
};

export const STANDING_LABELS: Record<CalculatedStanding, string> = {
  good_standing: "Good Standing",
  in_progress: "In Progress",
  no_email: "No email",
  not_tracked: "Not tracked",
};

export function computeProgress(
  member: MemberFacts,
  facts: AttendanceFact[],
  rules: PolicyRules,
  opts: {
    semester?: SemesterWindow | null;
    today?: string;
    scheduledRemaining?: Record<string, number>; // category → upcoming events left this semester
    behindPaceMargin?: number;
  } = {},
): ProgressResult {
  const counted = new Map<string, Set<string>>();
  let excludedBeforeMembership = 0;
  for (const f of facts) {
    const counts = f.counts_as_attended || (rules.excused_counts_as_attended && f.status_key === "excused");
    if (!counts) continue;
    if (!rules.credit_pre_membership_attendance && member.member_since && f.event_date && f.event_date < member.member_since) {
      excludedBeforeMembership += 1;
      continue;
    }
    const req = requirementForCategory(rules, f.effective_category);
    if (!req) continue;
    const set = counted.get(req.key) ?? new Set<string>();
    set.add(f.event_id); // one credit per event even if data were duplicated upstream
    counted.set(req.key, set);
  }

  const requirements: RequirementProgress[] = rules.requirements.map((r) => {
    const attended = counted.get(r.key)?.size ?? 0;
    const remaining = Math.max(0, r.required - attended);
    let scheduledRemaining: number | null = null;
    if (opts.scheduledRemaining) {
      scheduledRemaining = r.categories.reduce((s, c) => s + (opts.scheduledRemaining?.[c] ?? 0), 0);
    }
    return {
      key: r.key,
      label: r.label,
      required: r.required,
      attended,
      met: attended >= r.required,
      remaining,
      scheduledRemaining,
      canStillMeet: scheduledRemaining === null ? null : remaining <= scheduledRemaining,
    };
  });

  const totalCounted = requirements.reduce((s, r) => s + r.attended, 0);
  const combinedRequired = combinedRequirement(rules);
  const threshold = standoutThreshold(rules);
  const isStandout = threshold !== null && threshold > 0 && totalCounted >= threshold;
  const allMet = requirements.every((r) => r.met);
  const duesOk = !rules.dues_required_for_good_standing || member.dues_status === "paid" || member.dues_status === "waived";
  const progressUnits = requirements.reduce((s, r) => s + Math.min(r.attended, r.required), 0);
  const percentComplete = combinedRequired === 0 ? 100 : Math.round((progressUnits / combinedRequired) * 100);

  const reasons: string[] = [];
  const warnings: string[] = [];
  let standing: CalculatedStanding;

  if (!rules.tracked_statuses.includes(member.status_key)) {
    standing = "not_tracked";
    reasons.push(`Membership status "${member.status_key}" is not evaluated against attendance standards.`);
  } else if (!member.email) {
    standing = "no_email";
    reasons.push("No email on file. PIN scans are matched by email, so attendance may be incomplete — this is a data issue, not evidence of absence.");
  } else if (allMet && duesOk) {
    standing = "good_standing";
    reasons.push("All attendance requirements are met.");
    if (rules.dues_required_for_good_standing) reasons.push(member.dues_status === "waived" ? "Dues waived." : "Dues paid.");
  } else {
    standing = "in_progress";
    for (const r of requirements.filter((x) => !x.met)) reasons.push(`${r.label}: ${r.attended} of ${r.required} (${r.remaining} to go).`);
    if (!duesOk) {
      reasons.push(member.dues_status === null ? "Dues not recorded for this semester." : `Dues ${member.dues_status}.`);
    }
  }
  if (isStandout) reasons.push(`Standout: ${totalCounted} counted events (threshold ${threshold}).`);
  if (excludedBeforeMembership > 0) {
    warnings.push(`${excludedBeforeMembership} attendance record(s) before the membership start date are not counted.`);
  }

  // At-risk signals (system warnings only — never a disciplinary decision).
  let behindPace = false;
  if (rules.at_risk_enabled && opts.semester && opts.today && standing === "in_progress") {
    const total = Math.max(1, daysBetween(opts.semester.start_date, opts.semester.end_date));
    const elapsed = Math.min(1, Math.max(0, daysBetween(opts.semester.start_date, opts.today) / total));
    const margin = opts.behindPaceMargin ?? 0.25;
    behindPace = percentComplete / 100 < elapsed - margin;
    if (behindPace) {
      warnings.push(`Behind pace: ${percentComplete}% of requirements met with ${Math.round(elapsed * 100)}% of the semester elapsed.`);
    }
  }
  for (const r of requirements) {
    if (r.canStillMeet === false && standing === "in_progress") {
      warnings.push(`${r.label}: needs ${r.remaining} more but only ${r.scheduledRemaining} are scheduled.`);
    }
  }
  const needsAttention =
    standing === "no_email" || (standing === "in_progress" && (behindPace || requirements.some((r) => r.canStillMeet === false)));

  return {
    requirements,
    totalCounted,
    combinedRequired,
    standoutThreshold: threshold,
    isStandout,
    standing,
    reasons,
    warnings,
    behindPace,
    needsAttention,
    percentComplete,
    excludedBeforeMembership,
  };
}

/** Upcoming (not yet held) events per category in the semester. */
export function scheduledRemainingByCategory(
  events: { event_date: string | null; effective_category: string | null; planning_status?: string; archived_at?: string | null }[],
  today: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e.event_date || e.event_date < today || !e.effective_category) continue;
    if (e.planning_status === "cancelled" || e.archived_at) continue;
    out[e.effective_category] = (out[e.effective_category] ?? 0) + 1;
  }
  return out;
}
