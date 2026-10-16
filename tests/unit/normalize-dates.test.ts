import { describe, expect, it } from "vitest";
import { fuzzyKey, isReliableCardId, isValidEmail, normalizeEmail, normalizeText, similarity, splitFullName } from "@/lib/domain/normalize";
import { formatTimeRange, parseFlexibleDate, parseTimeRange } from "@/lib/domain/dates";

describe("normalization", () => {
  it("normalizes emails by trimming and lower-casing", () => {
    expect(normalizeEmail("  JDoe2@Student.GSU.edu ")).toBe("jdoe2@student.gsu.edu");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
  it("rejects placeholders and malformed emails", () => {
    expect(isValidEmail("MANUAL-jdoe")).toBe(false);
    expect(isValidEmail("(no email - manual sign-in)")).toBe(false);
    expect(isValidEmail("staff1@gsu.edu")).toBe(true);
  });
  it("only trusts digit card ids", () => {
    expect(isReliableCardId("001234567")).toBe(true);
    expect(isReliableCardId("MANUAL")).toBe(false);
    expect(isReliableCardId("")).toBe(false);
  });
  it("exact PIN-name normalization keeps punctuation; fuzzy key is only for suggestions", () => {
    expect(normalizeText("  Meet   the 100 ")).toBe("meet the 100");
    expect(normalizeText("Study & Self Care Social")).not.toBe(normalizeText("Study & Self-Care Social"));
    expect(fuzzyKey("Study & Self-Care Social")).toBe(fuzzyKey("Study and Self Care Social"));
    expect(similarity("Time management and Syllabus Breakdown", "Time Management & Syllabus Breakdown")).toBeGreaterThan(0.9);
    expect(similarity("Mocktails and Mindsets", "Turkey Drive")).toBeLessThan(0.3);
  });
  it("splits single-column names", () => {
    expect(splitFullName("Doe, Jordan")).toEqual({ first: "Jordan", last: "Doe" });
    expect(splitFullName("Pat Mason Jr")).toEqual({ first: "Pat Mason", last: "Jr" });
    expect(splitFullName("Ant")).toEqual({ first: "Ant", last: null });
  });
});

describe("dates and times", () => {
  it("parses the date formats seen in PIN exports and the workbook", () => {
    expect(parseFlexibleDate("9/2/2026 9:27 AM")).toBe("2026-09-02");
    expect(parseFlexibleDate("09/25/2026")).toBe("2026-09-25");
    expect(parseFlexibleDate("2026-10-08")).toBe("2026-10-08");
    expect(parseFlexibleDate("Sep 2, 2026")).toBe("2026-09-02");
    expect(parseFlexibleDate("Sept 9 2026")).toBe("2026-09-09");
    expect(parseFlexibleDate(new Date(Date.UTC(2026, 8, 3)))).toBe("2026-09-03");
    expect(parseFlexibleDate(46267)).toBe("2026-09-02");
  });
  it("returns null for invalid dates instead of guessing", () => {
    expect(parseFlexibleDate("2026-02-30")).toBeNull();
    expect(parseFlexibleDate("TBD")).toBeNull();
    expect(parseFlexibleDate("13/45/2026")).toBeNull();
  });
  it("parses calendar time ranges", () => {
    expect(parseTimeRange("5:30-7:00 PM")).toEqual({ start: "17:30", end: "19:00", note: null });
    expect(parseTimeRange("10:00 AM-1:00 PM")).toEqual({ start: "10:00", end: "13:00", note: null });
    expect(parseTimeRange("11:00-1:00 PM")).toEqual({ start: "11:00", end: "13:00", note: null });
    expect(parseTimeRange("12:00 PM - until")).toEqual({ start: "12:00", end: null, note: "12:00 PM - until" });
    expect(parseTimeRange("Time TBD")).toEqual({ start: null, end: null, note: "Time TBD" });
    expect(formatTimeRange("17:30", "19:00", null)).toBe("5:30 PM – 7:00 PM");
  });
});
