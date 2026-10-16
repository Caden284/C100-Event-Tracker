import { describe, expect, it } from "vitest";
import { combinedRequirement, parseRules, standoutThreshold, validateRules, workbookDraftRules, requirementForCategory } from "@/lib/domain/policy";
import { computeProgress, scheduledRemainingByCategory, type AttendanceFact, type MemberFacts } from "@/lib/domain/progress";
import { activeStrikeCount, strikeEligibility } from "@/lib/domain/standing";

const rules = workbookDraftRules({ meetings: 2, general: 3, service: 3, mentoring: 3 });
let n = 0;
const f = (category: string | null, opts: Partial<AttendanceFact> = {}): AttendanceFact => ({
  event_id: `e${++n}`, event_date: "2026-09-10", effective_category: category, counts_as_attended: true, status_key: "attended", ...opts,
});
const member = (o: Partial<MemberFacts> = {}): MemberFacts => ({ status_key: "active", email: "a@student.gsu.edu", member_since: null, dues_status: "paid", ...o });
const full = () => [f("meeting"), f("meeting"), f("general"), f("general"), f("general"), f("service"), f("service"), f("service"), f("mentoring"), f("mentoring"), f("mentoring")];

describe("workbook policy (draft)", () => {
  it("reproduces the workbook settings and the 17-event Standout threshold", () => {
    expect(combinedRequirement(rules)).toBe(11);
    expect(standoutThreshold(rules)).toBe(17);
    expect(rules.strikes.enabled).toBe(false);
    expect(rules.strikes.thresholds.map((t) => t.label)).toEqual(["Warning", "Probation", "Removal"]);
  });
  it("maps categories: Study and Recruitment count toward nothing", () => {
    expect(requirementForCategory(rules, "meeting")?.key).toBe("meetings");
    expect(requirementForCategory(rules, "study")).toBeNull();
    expect(requirementForCategory(rules, "recruitment")).toBeNull();
  });
  it("rejects a policy that counts recruitment or double-counts a category", () => {
    const bad = parseRules({ ...rules, requirements: [...rules.requirements, { key: "x", label: "X", required: 1, categories: ["recruitment", "meeting"] }] });
    const errs = validateRules(bad);
    expect(errs.join(" ")).toMatch(/Recruitment/);
    expect(errs.join(" ")).toMatch(/both/);
  });
});

describe("calculated standing", () => {
  it("Good Standing needs every requirement AND dues", () => {
    expect(computeProgress(member(), full(), rules).standing).toBe("good_standing");
    const unpaid = computeProgress(member({ dues_status: null }), full(), rules);
    expect(unpaid.standing).toBe("in_progress");
    expect(unpaid.reasons.join(" ")).toMatch(/Dues not recorded/);
  });
  it("each category contributes only to its own requirement", () => {
    const p = computeProgress(member(), [f("meeting"), f("service"), f("recruitment"), f("study"), f(null)], rules);
    expect(p.requirements.find((r) => r.key === "meetings")!.attended).toBe(1);
    expect(p.requirements.find((r) => r.key === "service")!.attended).toBe(1);
    expect(p.totalCounted).toBe(2); // recruitment, study and uncategorized do not count
  });
  it("non-attended statuses do not count", () => {
    const p = computeProgress(member(), [f("meeting", { counts_as_attended: false, status_key: "registered" }), f("meeting", { counts_as_attended: false, status_key: "absent" })], rules);
    expect(p.totalCounted).toBe(0);
  });
  it("excused counts only when the policy says so", () => {
    const facts = [f("meeting", { counts_as_attended: false, status_key: "excused" })];
    expect(computeProgress(member(), facts, rules).totalCounted).toBe(0);
    expect(computeProgress(member(), facts, { ...rules, excused_counts_as_attended: true }).totalCounted).toBe(1);
  });
  it("missing email is a data warning, not zero participation", () => {
    const p = computeProgress(member({ email: null }), [], rules);
    expect(p.standing).toBe("no_email");
    expect(p.reasons[0]).toMatch(/not evidence of absence/);
    expect(p.needsAttention).toBe(true);
  });
  it("inactive and graduated members are not evaluated", () => {
    expect(computeProgress(member({ status_key: "graduated" }), [], rules).standing).toBe("not_tracked");
    expect(computeProgress(member({ status_key: "inactive" }), [], rules).needsAttention).toBe(false);
  });
  it("Standout appears at 17 counted events (also alongside Good Standing)", () => {
    const facts = [...full(), f("general"), f("general"), f("general"), f("service"), f("service"), f("mentoring")];
    const p = computeProgress(member(), facts, rules);
    expect(p.totalCounted).toBe(17);
    expect(p.isStandout).toBe(true);
    expect(p.standing).toBe("good_standing");
  });
  it("counts each event once even if facts repeat", () => {
    const one = f("meeting");
    expect(computeProgress(member(), [one, { ...one }], rules).totalCounted).toBe(1);
  });
  it("attendance before the membership start date does not count unless policy allows", () => {
    const facts = [f("meeting", { event_date: "2026-09-02" }), f("meeting", { event_date: "2026-10-06" })];
    const p = computeProgress(member({ member_since: "2026-10-01" }), facts, rules);
    expect(p.totalCounted).toBe(1);
    expect(p.excludedBeforeMembership).toBe(1);
    expect(computeProgress(member({ member_since: "2026-10-01" }), facts, { ...rules, credit_pre_membership_attendance: true }).totalCounted).toBe(2);
  });
  it("changing approved requirements changes calculated eligibility", () => {
    const facts = [f("meeting"), f("general")];
    const lighter = parseRules({ ...rules, requirements: [{ key: "meetings", label: "Meetings", required: 1, categories: ["meeting"] }, { key: "general", label: "General", required: 1, categories: ["general"] }] });
    expect(computeProgress(member(), facts, rules).standing).toBe("in_progress");
    expect(computeProgress(member(), facts, lighter).standing).toBe("good_standing");
  });
  it("flags members who cannot meet a requirement with the events still scheduled", () => {
    const sched = scheduledRemainingByCategory([
      { event_date: "2026-11-11", effective_category: "mentoring" }, { event_date: "2026-11-17", effective_category: "mentoring" },
      { event_date: "2026-09-01", effective_category: "mentoring" }, { event_date: "2026-11-20", effective_category: "mentoring", planning_status: "cancelled" },
    ], "2026-10-16");
    expect(sched.mentoring).toBe(2);
    const p = computeProgress(member(), [], rules, { semester: { start_date: "2026-08-15", end_date: "2026-12-15" }, today: "2026-10-16", scheduledRemaining: sched });
    expect(p.requirements.find((r) => r.key === "mentoring")!.canStillMeet).toBe(false);
    expect(p.behindPace).toBe(true);
    expect(p.needsAttention).toBe(true);
  });
});

describe("strikes stay informational under a draft policy", () => {
  it("describes draft eligibility as not a chapter decision", () => {
    const e = strikeEligibility(2, rules, "draft");
    expect(e.label).toBe("Probation");
    expect(e.policyApproved).toBe(false);
    expect(e.description).toMatch(/DRAFT/);
    expect(e.description).toMatch(/not a chapter decision/);
  });
  it("even an approved policy requires officer action", () => {
    const e = strikeEligibility(1, { ...rules, strikes: { ...rules.strikes, enabled: true } }, "approved");
    expect(e.description).toMatch(/requires an authorized officer/);
    expect(e.approaching).toBe(true);
  });
  it("voided strikes are excluded", () => {
    expect(activeStrikeCount([{ points: 1, voided_at: null, semester_id: "s" }, { points: 1, voided_at: "2026-10-01", semester_id: "s" }], "s")).toBe(1);
  });
});
