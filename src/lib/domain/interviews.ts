/**
 * Intake interviews: the rubric/script configuration stored on each intake cycle,
 * and the scoring arithmetic. The packet's wording lives in the database
 * (intake_cycles.config), not in this file, because the packet is confidential.
 */
import { z } from "zod";

const text = z.string().default("");

export const criterionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  questions: text,                 // e.g. "Q1" or "Q6–Q7"
  anchors: z.object({ "5": text, "3": text, "1": text }).partial().default({}),
});

export const questionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  text: z.string(),
  look_for: text,
});

export const clockSchema = z.object({ from: z.number().int().min(0), to: z.number().int().min(1), label: z.string() });

export const intakeConfigSchema = z.object({
  rubric: z.array(criterionSchema).default([]),
  questions: z.array(questionSchema).default([]),
  own_question: text,
  clock: z.array(clockSchema).default([]),
  before_call: z.array(z.string()).default([]),
  opening: z.array(z.string()).default([]),
  closing: z.array(z.string()).default([]),
  recommendations: z.array(z.object({ key: z.enum(["strong_yes", "yes", "lean_no", "no"]), label: z.string(), help: text })).default([
    { key: "strong_yes", label: "Strong Yes", help: "" },
    { key: "yes", label: "Yes", help: "" },
    { key: "lean_no", label: "Lean No", help: "" },
    { key: "no", label: "No", help: "" },
  ]),
  red_flag_help: text,
  do_not_ask: z.array(z.string()).default([]),
  also: z.array(z.string()).default([]),
  volunteered_note: text,
  engagement: z.array(z.object({ min: z.number().int().min(0), points: z.number().int().min(0) })).default([
    { min: 5, points: 5 }, { min: 3, points: 3 }, { min: 1, points: 1 },
  ]),
  tie_breakers: z.array(z.string()).default([]),
});

export type IntakeConfig = z.infer<typeof intakeConfigSchema>;
export type Recommendation = "strong_yes" | "yes" | "lean_no" | "no";

export function parseIntakeConfig(raw: unknown): IntakeConfig {
  const r = intakeConfigSchema.safeParse(raw ?? {});
  return r.success ? r.data : intakeConfigSchema.parse({});
}

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_yes: "Strong Yes", yes: "Yes", lean_no: "Lean No", no: "No",
};

export const APPLICANT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", completed: "Completed", no_show: "No-show", rescheduled: "Rescheduled", withdrawn: "Withdrawn",
};

export const CYCLE_STATUS_LABELS: Record<string, string> = {
  setup: "Setting up", interviewing: "Interviewing", deliberation: "Deliberation", closed: "Closed",
};

/** Sum of the rubric scores, or null until at least one criterion is scored. */
export function interviewTotal(scores: Record<string, number | null | undefined>, config: IntakeConfig): number | null {
  const vals = config.rubric.map((c) => scores[c.key]).filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

export function maxInterviewScore(config: IntakeConfig): number {
  return config.rubric.length * 5;
}

export function isComplete(scores: Record<string, number | null | undefined>, recommendation: string | null | undefined, config: IntakeConfig): boolean {
  return !!recommendation && config.rubric.every((c) => typeof scores[c.key] === "number");
}

/** Engagement points from events attended (packet: 5+ = 5, 3–4 = 3, 1–2 = 1, none = 0). */
export function engagementPoints(events: number | null | undefined, config: IntakeConfig): number {
  if (!events) return 0;
  return config.engagement.filter((t) => events >= t.min).reduce((best, t) => Math.max(best, t.points), 0);
}

export function maxEngagement(config: IntakeConfig): number {
  return config.engagement.reduce((m, t) => Math.max(m, t.points), 0);
}

/** Replaces the packet's [placeholders] in a line of the script. Unknown values stay visible as [label]. */
export function fillScript(line: string, values: Record<string, string | null | undefined>): string {
  return line.replace(/\[([^\]]+)\]/g, (whole, key: string) => {
    const v = values[key.trim().toLowerCase()];
    return v ? v : whole;
  });
}

/** Which clock segment a running timer is in (seconds elapsed). */
export function clockSegment(config: IntakeConfig, elapsed: number): { index: number; label: string; remaining: number } | null {
  const i = config.clock.findIndex((c) => elapsed >= c.from && elapsed < c.to);
  if (i < 0) return null;
  return { index: i, label: config.clock[i].label, remaining: config.clock[i].to - elapsed };
}

export type RankInput = {
  id: string;
  total: number | null;
  engagement: number;
  events: number;
  serviceEvents: number;
};

/**
 * Ranked by composite (interview total + engagement), then the packet's tie-breakers
 * that can be calculated: events attended, then service events attended. Applicants
 * without a submitted score are listed after everyone who has one.
 */
export function rankApplicants<T extends RankInput>(list: T[]): (T & { composite: number | null; rank: number | null })[] {
  const scored = list.filter((a) => a.total !== null).map((a) => ({ ...a, composite: (a.total ?? 0) + a.engagement }));
  scored.sort((a, b) => b.composite - a.composite || b.events - a.events || b.serviceEvents - a.serviceEvents);
  const ranked = scored.map((a, i) => ({ ...a, rank: i + 1 }));
  const unscored = list.filter((a) => a.total === null).map((a) => ({ ...a, composite: null, rank: null }));
  return [...ranked, ...unscored];
}
