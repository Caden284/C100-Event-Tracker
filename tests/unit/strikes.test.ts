import { describe, expect, it } from "vitest";
import { parseRules, workbookDraftRules } from "@/lib/domain/policy";
import { excusesWithinCap, midtermDate, suggestStrikes, type SuggestionEvent, type SuggestionFact, type SuggestionMember } from "@/lib/domain/strikes";

const rules = workbookDraftRules({ meetings: 2, general: 3, service: 3, mentoring: 3 });
const semester = { id: "fall", start_date: "2026-08-15", end_date: "2026-12-15", dues_deadline: "2026-10-08" };

const member = (id: string, o: Partial<SuggestionMember> = {}): SuggestionMember => ({
  member_id: `m-${id}`, person_id: `p-${id}`, status_key: "active", email: `${id}@student.gsu.edu`, member_since: null, dues: { recorded: true, ok: true }, ...o,
});
const event = (id: string, date: string, category = "meeting", o: Partial<SuggestionEvent> = {}): SuggestionEvent => ({
  id, name: `Event ${id}`, event_date: date, effective_category: category, planning_status: "confirmed", archived_at: null, ...o,
});
const fact = (person: string, ev: SuggestionEvent, status = "attended"): SuggestionFact => ({
  person_id: `p-${person}`, event_id: ev.id, event_date: ev.event_date, effective_category: ev.effective_category,
  counts_as_attended: status === "attended", status_key: status,
});

describe("old stored policies", () => {
  it("get the recommended triggers and a 3-excuse limit by default", () => {
    const r = parseRules({ requirements: [], strikes: { enabled: false, thresholds: [] } });
    expect(r.strikes.triggers.unexcused_absence).toEqual({ enabled: true, categories: ["meeting"], points: 1 });
    expect(r.strikes.triggers.midterm_checkpoint.min_percent).toBe(50);
    expect(r.strikes.max_excused_per_semester).toBe(3);
    expect(r.excused_counts_as_attended).toBe(false);
  });
});

describe("unexcused absence from a General Body Meeting", () => {
  const gbm = event("gbm1", "2026-09-02");
  const today = "2026-09-20";
  it("suggests a strike for a member who missed it without an excuse", () => {
    const res = suggestStrikes({ rules, semester, today, members: [member("a"), member("b")], events: [gbm], facts: [fact("a", gbm)] });
    expect(res.suggestions.map((s) => [s.member_id, s.trigger_key])).toEqual([["m-b", "absence:gbm1"]]);
    expect(res.suggestions[0].reason).toMatch(/Unexcused absence: Event gbm1/);
  });
  it("never suggests one for an excused absence within the limit", () => {
    const res = suggestStrikes({ rules, semester, today, members: [member("a"), member("b")], events: [gbm], facts: [fact("a", gbm), fact("b", gbm, "excused")] });
    expect(res.suggestions).toEqual([]);
  });
  it("still suggests one when the excuse is over the per-semester limit, and says so", () => {
    const gbms = ["09-02", "09-09", "09-16", "09-23"].map((d, i) => event(`g${i}`, `2026-${d}`));
    const facts = [...gbms.map((g) => fact("a", g)), ...gbms.map((g) => fact("b", g, "excused"))];
    const res = suggestStrikes({ rules, semester, today: "2026-09-30", members: [member("a"), member("b")], events: gbms, facts });
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].trigger_key).toBe("absence:g3");
    expect(res.suggestions[0].note).toMatch(/over the limit of 3/);
  });
  it("skips meetings with no attendance uploaded, future meetings, and members without an email", () => {
    const later = event("gbm2", "2026-10-06");
    const cancelled = event("gbm3", "2026-09-10", "meeting", { planning_status: "cancelled" });
    const res = suggestStrikes({ rules, semester, today, members: [member("a"), member("c", { email: null })], events: [gbm, later, cancelled], facts: [] });
    expect(res.suggestions).toEqual([]);
    expect(res.eventsWithoutAttendance.map((e) => e.id)).toEqual(["gbm1"]);
    expect(res.skippedNoEmail).toBe(1);
  });
  it("ignores events before someone became a member, and decisions already made", () => {
    const res = suggestStrikes({
      rules, semester, today, events: [gbm], facts: [fact("a", gbm)],
      members: [member("a"), member("n", { member_since: "2026-09-15" }), member("d")],
      decided: new Map([["m-d", new Set(["absence:gbm1"])]]),
    });
    expect(res.suggestions).toEqual([]);
  });
  it("does not count excuses for optional events against the limit", () => {
    const services = ["09-03", "09-04", "09-05"].map((d, i) => event(`s${i}`, `2026-${d}`, "service"));
    const facts = [fact("a", gbm), fact("b", gbm, "excused"), ...services.map((x) => fact("b", x, "excused"))];
    const caps = excusesWithinCap(facts, 3, ["meeting"]);
    expect([...caps.get("p-b")!.within]).toEqual(["gbm1"]);
  });
});

describe("checkpoints and dues", () => {
  const events = [event("gbm", "2026-09-02"), event("gen", "2026-09-10", "general"), event("svc", "2026-09-18", "service")];
  const facts = [fact("a", events[0]), fact("a", events[1]), fact("a", events[2]), fact("b", events[0])];
  const strong = ["g1", "g2", "s1", "s2", "s3", "m1", "m2", "m3"].map((id, i) =>
    event(id, `2026-10-0${(i % 8) + 1}`, id[0] === "g" ? "general" : id[0] === "s" ? "service" : "mentoring"));
  it("uses the semester midpoint when no checkpoint date is set", () => {
    expect(midtermDate(rules, semester)).toBe("2026-10-15");
  });
  it("suggests a midterm strike only after the checkpoint, for members under 50%", () => {
    const members = [member("a"), member("b")];
    const before = suggestStrikes({ rules, semester, today: "2026-10-15", members, events, facts });
    expect(before.suggestions.filter((s) => s.kind === "midterm")).toEqual([]);
    const allFacts = [...facts, ...strong.map((e) => fact("a", e))];
    const after = suggestStrikes({ rules, semester, today: "2026-10-16", members, events: [...events, ...strong], facts: allFacts });
    expect(after.suggestions.filter((s) => s.kind === "midterm").map((s) => s.member_id)).toEqual(["m-b"]);
  });
  it("waits for missing rosters before checking the midterm checkpoint", () => {
    const missing = event("mtg", "2026-10-06", "meeting");
    const res = suggestStrikes({ rules, semester, today: "2026-10-16", members: [member("b")], events: [...events, missing], facts });
    expect(res.suggestions.filter((s) => s.kind === "midterm")).toEqual([]);
    expect(res.midtermWaitingFor.map((e) => e.id)).toEqual(["mtg"]);
  });
  it("suggests an end-of-semester strike listing the unmet requirements", () => {
    const res = suggestStrikes({ rules, semester, today: "2026-12-16", members: [member("b")], events, facts });
    const final = res.suggestions.find((s) => s.kind === "final");
    expect(final?.reason).toMatch(/General Body Meetings 1\/2/);
  });
  it("checks dues only after the deadline and once dues are being recorded", () => {
    const unpaid = member("u", { dues: { recorded: true, ok: false } });
    const none = member("x", { dues: { recorded: false, ok: false } });
    const early = suggestStrikes({ rules, semester, today: "2026-10-08", members: [unpaid], events: [], facts: [] });
    expect(early.duesSkippedReason).toMatch(/hasn't passed/);
    const nobody = suggestStrikes({ rules, semester, today: "2026-10-09", members: [none], events: [], facts: [] });
    expect(nobody.suggestions).toEqual([]);
    expect(nobody.duesSkippedReason).toMatch(/No dues payments/);
    const res = suggestStrikes({ rules, semester, today: "2026-10-09", members: [unpaid, none, member("p")], events: [], facts: [] });
    expect(res.suggestions.filter((s) => s.kind === "dues").map((s) => s.member_id)).toEqual(["m-u", "m-x"]);
  });
  it("respects triggers that are turned off", () => {
    const off = parseRules({ ...rules, strikes: { ...rules.strikes, triggers: { unexcused_absence: { enabled: false }, midterm_checkpoint: { enabled: false }, end_of_semester: { enabled: false }, dues_deadline: { enabled: false } } } });
    const res = suggestStrikes({ rules: off, semester, today: "2026-12-20", members: [member("b", { dues: { recorded: true, ok: false } })], events, facts });
    expect(res.suggestions).toEqual([]);
  });
});
