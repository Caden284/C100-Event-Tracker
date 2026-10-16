import { describe, expect, it } from "vitest";
import { evaluateEligibility, improvement, prospectEngagement, rank } from "@/lib/domain/recognition";

describe("prospect engagement", () => {
  const s = { high_min_events: 3, medium_min_events: 2 };
  const a = (d: string, ok = true) => ({ event_date: d, counts_as_attended: ok });
  it("uses the workbook thresholds and ignores non-attended rows", () => {
    expect(prospectEngagement([a("2026-09-03"), a("2026-09-10"), a("2026-10-01")], s).interest).toBe("high");
    expect(prospectEngagement([a("2026-09-03"), a("2026-09-10"), a("2026-10-01", false)], s).interest).toBe("medium");
    expect(prospectEngagement([], s).interest).toBe("low");
    expect(prospectEngagement([a("2026-09-03"), a("2026-10-01")], s).distinctMonths).toBe(2);
  });
});

describe("configurable eligibility", () => {
  it("unconfigured rules list everyone for review", () => {
    const r = evaluateEligibility("member", {}, { countedEvents: 0, categoriesAttended: 0, eventsAttended: 0, distinctMonths: 0 });
    expect(r.eligible).toBe(true);
    expect(r.configured).toBe(false);
  });
  it("applies thresholds and explains each one", () => {
    const r = evaluateEligibility("member", { min_counted_events: 10, require_member_status: ["active"] }, { countedEvents: 8, categoriesAttended: 3, eventsAttended: 0, distinctMonths: 0, memberStatus: "active" });
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("✗ Counted events"))).toBe(true);
  });
  it("prospect awards never use member standing criteria", () => {
    const r = evaluateEligibility("prospect", { min_counted_events: 99, min_events_attended: 2 }, { countedEvents: 0, categoriesAttended: 0, eventsAttended: 3, distinctMonths: 1 });
    expect(r.eligible).toBe(true);
  });
});

describe("most improved is fair", () => {
  it("compares rates, not raw counts", () => {
    // 4 of 20 → 6 of 10 is a big improvement even though raw +2 is small
    const big = improvement({ attended: 4, available: 20 }, { attended: 6, available: 10 });
    const raw = improvement({ attended: 10, available: 20 }, { attended: 11, available: 30 });
    expect(big.delta!).toBeGreaterThan(raw.delta!);
    expect(raw.delta!).toBeLessThan(0);
  });
  it("does not rank members without a fair baseline", () => {
    expect(improvement(null, { attended: 5, available: 10 }).eligible).toBe(false);
    expect(improvement({ attended: 1, available: 2 }, { attended: 5, available: 10 }, 3).eligible).toBe(false);
    expect(improvement({ attended: 1, available: 5 }, { attended: 0, available: 0 }).eligible).toBe(false);
  });
});

describe("leaderboard ranking", () => {
  it("uses competition ranking for ties", () => {
    expect(rank([{ s: 5 }, { s: 9 }, { s: 5 }, { s: 1 }], (x) => x.s).map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });
});
