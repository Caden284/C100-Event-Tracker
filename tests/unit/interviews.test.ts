import { describe, expect, it } from "vitest";
import { clockSegment, engagementPoints, fillScript, interviewTotal, isComplete, parseIntakeConfig, rankApplicants } from "@/lib/domain/interviews";

const config = parseIntakeConfig({
  rubric: [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }],
  clock: [{ from: 0, to: 90, label: "Welcome" }, { from: 90, to: 660, label: "Questions 1–7" }],
});

describe("interview scoring", () => {
  it("totals only scored criteria and knows when a sheet is complete", () => {
    expect(interviewTotal({}, config)).toBeNull();
    expect(interviewTotal({ a: 4, b: 5 }, config)).toBe(9);
    expect(isComplete({ a: 4, b: 5 }, "yes", config)).toBe(false);
    expect(isComplete({ a: 4, b: 5, c: 1 }, null, config)).toBe(false);
    expect(isComplete({ a: 4, b: 5, c: 1 }, "lean_no", config)).toBe(true);
  });

  it("uses the packet's engagement tiers by default", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => engagementPoints(n, config))).toEqual([0, 1, 1, 3, 3, 5, 5]);
    expect(engagementPoints(null, config)).toBe(0);
  });

  it("fills script placeholders and leaves unknown ones visible", () => {
    expect(fillScript("Hi [name], I'm [your name], [your role]. Decisions by [date].", { name: "Sam", "your name": "Alex", "your role": "Secretary" }))
      .toBe("Hi Sam, I'm Alex, Secretary. Decisions by [date].");
  });

  it("finds the current clock segment", () => {
    expect(clockSegment(config, 30)).toEqual({ index: 0, label: "Welcome", remaining: 60 });
    expect(clockSegment(config, 100)?.label).toBe("Questions 1–7");
    expect(clockSegment(config, 9999)).toBeNull();
  });

  it("ranks by composite, then events attended, then service events; unscored last", () => {
    const ranked = rankApplicants([
      { id: "u", total: null, engagement: 5, events: 9, serviceEvents: 3 },
      { id: "a", total: 25, engagement: 1, events: 2, serviceEvents: 0 },
      { id: "b", total: 23, engagement: 3, events: 4, serviceEvents: 1 },
      { id: "c", total: 23, engagement: 3, events: 4, serviceEvents: 2 },
      { id: "d", total: 28, engagement: 0, events: 0, serviceEvents: 0 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([["d", 1], ["c", 2], ["b", 3], ["a", 4], ["u", null]]);
  });
});
