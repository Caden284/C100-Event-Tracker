/**
 * Membership policy rules. Stored as JSON on membership_policies.rules and
 * versioned in the database (draft → approved → retired).
 */
import { z } from "zod";

export const requirementSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Use lower-case letters, digits and underscores"),
  label: z.string().min(1),
  required: z.number().int().min(0).max(100),
  categories: z.array(z.string()).min(1, "Pick at least one event category"),
});

export const strikeThresholdSchema = z.object({
  strikes: z.number().int().min(1).max(10),
  label: z.string().min(1),
  action: z.enum(["formal_warning", "probation", "removal", "other"]),
});

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");
const strikePoints = z.number().int().min(1).max(3).default(1);

/** What can earn a strike under the policy. Each produces a SUGGESTION an officer confirms or dismisses. */
export const strikeTriggersSchema = z.object({
  /** Missing an event in these categories without an excuse (default: General Body Meetings). */
  unexcused_absence: z.object({
    enabled: z.boolean().default(true),
    categories: z.array(z.string()).default(["meeting"]),
    points: strikePoints,
  }).prefault({}),
  /** Below this share of the requirements by the checkpoint date (default: semester midpoint). */
  midterm_checkpoint: z.object({
    enabled: z.boolean().default(true),
    date: isoDay.nullable().default(null),
    min_percent: z.number().int().min(1).max(100).default(50),
    points: strikePoints,
  }).prefault({}),
  /** Any requirement still unmet when the semester ends. */
  end_of_semester: z.object({ enabled: z.boolean().default(true), points: strikePoints }).prefault({}),
  /** Dues not paid (or waived) by the semester's dues deadline. */
  dues_deadline: z.object({ enabled: z.boolean().default(true), points: strikePoints }).prefault({}),
});

export const policyRulesSchema = z.object({
  requirements: z.array(requirementSchema),
  dues_required_for_good_standing: z.boolean().default(true),
  standout_multiplier: z.number().min(1).max(5).nullable().default(1.5),
  excused_counts_as_attended: z.boolean().default(false),
  waivers_allowed: z.boolean().default(false),
  credit_pre_membership_attendance: z.boolean().default(false),
  tracked_statuses: z.array(z.string()).default(["active"]),
  at_risk_enabled: z.boolean().default(true),
  strikes: z
    .object({
      enabled: z.boolean().default(false),
      thresholds: z.array(strikeThresholdSchema).default([]),
      triggers: strikeTriggersSchema.prefault({}),
      /** Excused absences that protect from strikes each semester. null = no limit. */
      max_excused_per_semester: z.number().int().min(0).max(50).nullable().default(3),
      /** Strikes count only within the semester they were given. */
      reset_each_semester: z.boolean().default(true),
      /** A make-up service event can remove one strike (recorded by an officer as −1). */
      makeup_clears_strike: z.boolean().default(true),
    })
    .prefault({}),
  probation_criteria: z.string().default(""),
  review_process: z.string().default(""),
  appeal_process: z.string().default(""),
});

export type PolicyRules = z.infer<typeof policyRulesSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type StrikeTriggers = z.infer<typeof strikeTriggersSchema>;

export type PolicyRecord = {
  id: string;
  name: string;
  version: number;
  status: "draft" | "approved" | "retired";
  rules: unknown;
  approved_at?: string | null;
};

/** Parses stored rules, falling back to safe defaults for missing fields. */
export function parseRules(raw: unknown): PolicyRules {
  const res = policyRulesSchema.safeParse(raw ?? {});
  if (res.success) return res.data;
  return policyRulesSchema.parse({ requirements: [] });
}

export const DRAFT_PROBATION_CRITERIA =
  "PROPOSAL: A member reaching 2 confirmed strikes in a semester is placed on probation after a meeting with the President or Membership Chair. Probation lasts the rest of the semester; meeting every requirement by the end of the semester ends it.";
export const DRAFT_REVIEW_PROCESS =
  "PROPOSAL: The member receives written notice of each strike within 7 days. At 3 strikes the executive board reviews the member's record and votes on removal; removal is never automatic.";
export const DRAFT_APPEAL_PROCESS =
  "PROPOSAL: A member may appeal any strike or decision in writing within 7 days of notice. The board decides the appeal at its next meeting, without the officer who issued the strike voting.";

/**
 * The rules found in C100_Membership_Tracker.xlsx (Settings tab, How To Use tab).
 * They are imported as a DRAFT — existing workbook values, not approved policy.
 */
export function workbookDraftRules(settings: { meetings: number; general: number; service: number; mentoring: number }): PolicyRules {
  return policyRulesSchema.parse({
    requirements: [
      { key: "meetings", label: "General Body Meetings", required: settings.meetings, categories: ["meeting"] },
      { key: "general", label: "General events", required: settings.general, categories: ["general"] },
      { key: "service", label: "Service events", required: settings.service, categories: ["service"] },
      { key: "mentoring", label: "Mentoring (Carver/BEST)", required: settings.mentoring, categories: ["mentoring"] },
    ],
    dues_required_for_good_standing: true,
    standout_multiplier: 1.5,
    excused_counts_as_attended: false,
    waivers_allowed: false,
    credit_pre_membership_attendance: false,
    tracked_statuses: ["active"],
    at_risk_enabled: true,
    strikes: {
      enabled: false,
      thresholds: [
        { strikes: 1, label: "Written warning", action: "formal_warning" },
        { strikes: 2, label: "Probation", action: "probation" },
        { strikes: 3, label: "Board review (possible removal)", action: "removal" },
      ],
      // Proposed by the hub for the board to consider (see LIMITATIONS.md).
      triggers: {
        unexcused_absence: { enabled: true, categories: ["meeting"], points: 1 },
        midterm_checkpoint: { enabled: true, date: null, min_percent: 50, points: 1 },
        end_of_semester: { enabled: true, points: 1 },
        dues_deadline: { enabled: true, points: 1 },
      },
      max_excused_per_semester: 3,
      reset_each_semester: true,
      makeup_clears_strike: true,
    },
    probation_criteria: DRAFT_PROBATION_CRITERIA,
    review_process: DRAFT_REVIEW_PROCESS,
    appeal_process: DRAFT_APPEAL_PROCESS,
  });
}

/** Which requirement (if any) an event category contributes to under these rules. */
export function requirementForCategory(rules: PolicyRules, category: string | null | undefined): Requirement | null {
  if (!category) return null;
  return rules.requirements.find((r) => r.categories.includes(category)) ?? null;
}

export function countedCategories(rules: PolicyRules): Set<string> {
  return new Set(rules.requirements.flatMap((r) => r.categories));
}

export function combinedRequirement(rules: PolicyRules): number {
  return rules.requirements.reduce((s, r) => s + r.required, 0);
}

export function standoutThreshold(rules: PolicyRules): number | null {
  if (!rules.standout_multiplier) return null;
  return Math.ceil(combinedRequirement(rules) * rules.standout_multiplier);
}

export function policyLabel(p: { name: string; version: number; status: string } | null | undefined): string {
  if (!p) return "No policy assigned";
  const s = p.status === "approved" ? "Approved" : p.status === "draft" ? "DRAFT — pending executive board approval" : "Retired";
  return `${p.name} v${p.version} · ${s}`;
}

export function validateRules(rules: PolicyRules): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const cats = new Map<string, string>();
  for (const r of rules.requirements) {
    if (keys.has(r.key)) errors.push(`Requirement key "${r.key}" is used twice.`);
    keys.add(r.key);
    for (const c of r.categories) {
      if (cats.has(c)) errors.push(`Category "${c}" counts toward both "${cats.get(c)}" and "${r.label}". Each category may count toward one requirement.`);
      cats.set(c, r.label);
    }
  }
  if (cats.has("recruitment")) {
    errors.push("Recruitment events are for prospective-member tracking and should not count toward member requirements.");
  }
  const strikes = [...rules.strikes.thresholds].map((t) => t.strikes);
  if (new Set(strikes).size !== strikes.length) errors.push("Two strike thresholds use the same number of strikes.");
  const t = rules.strikes.triggers.unexcused_absence;
  if (t.enabled && t.categories.length === 0) errors.push("Choose at least one event category for unexcused-absence strikes, or turn that trigger off.");
  if (t.categories.includes("recruitment")) errors.push("Recruitment events should not earn members strikes.");
  return errors;
}
