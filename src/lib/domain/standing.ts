/**
 * Strikes, draft-policy eligibility and the four distinct "kinds" of status the
 * UI must never confuse:
 *   1. Official membership status (recorded by an officer)
 *   2. Calculated eligibility (progress.ts)
 *   3. System warning (generated, e.g. "behind pace")
 *   4. Approved decision (a disciplinary_actions row with status approved/active)
 */
import type { PolicyRules } from "./policy";

export type StrikeRecord = { points: number; voided_at: string | null; semester_id: string | null };

export function activeStrikeCount(records: StrikeRecord[], semesterId?: string | null): number {
  return records
    .filter((r) => !r.voided_at && (semesterId === undefined || r.semester_id === semesterId || r.semester_id === null))
    .reduce((s, r) => s + r.points, 0);
}

export type StrikeEligibility = {
  strikes: number;
  label: string | null;          // threshold label reached, if any
  next: { strikes: number; label: string } | null;
  approaching: boolean;           // one strike away from the next threshold
  policyApproved: boolean;
  policyEnabled: boolean;
  /** Human text that ALWAYS states whether this is official. */
  description: string;
};

export function strikeEligibility(strikes: number, rules: PolicyRules, policyStatus: "draft" | "approved" | "retired" | null): StrikeEligibility {
  const thresholds = [...rules.strikes.thresholds].sort((a, b) => a.strikes - b.strikes);
  const reached = thresholds.filter((t) => strikes >= t.strikes).pop() ?? null;
  const next = thresholds.find((t) => t.strikes > strikes) ?? null;
  const policyApproved = policyStatus === "approved";
  const policyEnabled = rules.strikes.enabled;
  const official = policyApproved && policyEnabled;
  let description: string;
  if (thresholds.length === 0) description = "No strike thresholds are configured.";
  else if (!reached) description = `${strikes} strike(s). No threshold reached.`;
  else if (official) description = `${strikes} strike(s): meets the approved "${reached.label}" threshold. A formal decision still requires an authorized officer.`;
  else description = `${strikes} strike(s): would meet "${reached.label}" under the DRAFT policy (pending executive board approval). This is not a chapter decision.`;
  return {
    strikes,
    label: reached?.label ?? null,
    next: next ? { strikes: next.strikes, label: next.label } : null,
    approaching: !!next && next.strikes - strikes === 1 && strikes > 0,
    policyApproved,
    policyEnabled,
    description,
  };
}

export type DisciplinaryStatus = "proposed" | "approved" | "active" | "resolved" | "rejected" | "overturned";

export function isFormalDecisionInForce(a: { status: DisciplinaryStatus; review_date?: string | null }): boolean {
  return a.status === "approved" || a.status === "active";
}

export const ACTION_LABELS: Record<string, string> = {
  formal_warning: "Formal warning",
  probation: "Probation",
  removal: "Removal",
  other: "Other",
};
