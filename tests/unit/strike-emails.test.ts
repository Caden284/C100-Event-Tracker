import { describe, expect, it } from "vitest";
import { greetingName, strikeEmail, strikeEmailLevel } from "@/lib/domain/strike-emails";

const base = { firstName: "Jordan", reasons: [{ reason: "Unexcused absence from the GBM", date: "2026-11-04T18:00:00Z" }], semesterName: "Fall 2026", senderName: "Caden Fahie", senderRole: "Secretary" };

describe("strike emails", () => {
  it("picks the template from the strike count", () => {
    expect(strikeEmailLevel(0)).toBeNull();
    expect(strikeEmailLevel(-1)).toBeNull();
    expect(strikeEmailLevel(1)).toBe(1);
    expect(strikeEmailLevel(2)).toBe(2);
    expect(strikeEmailLevel(3)).toBe(3);
    expect(strikeEmailLevel(5)).toBe(3);
  });

  it("fills in the member, reasons, semester and sender", () => {
    const e = strikeEmail({ ...base, strikes: 1 });
    expect(e.level).toBe(1);
    expect(e.subject).toContain("1 of 3");
    expect(e.body).toMatch(/^Hi Jordan,/);
    expect(e.body).toContain("- Unexcused absence from the GBM (recorded Nov 4)");
    expect(e.body).toContain("1 strike for Fall 2026");
    expect(e.body).toContain("written warning");
    expect(e.body.trimEnd().endsWith("Caden Fahie\nSecretary\nCollegiate 100 at Georgia State University")).toBe(true);
  });

  it("describes probation at two strikes and board review at three or more", () => {
    const two = strikeEmail({ ...base, strikes: 2 });
    expect(two.body).toContain("You now have 2 strikes for Fall 2026");
    expect(two.body).toContain("places you on probation");
    const four = strikeEmail({ ...base, strikes: 4 });
    expect(four.level).toBe(3);
    expect(four.body).toContain("reached 4 strikes");
    expect(four.body).toContain("No decision has been made yet");
  });

  it("leaves visible placeholders for the general templates", () => {
    const e = strikeEmail({ firstName: "[First name]", strikes: 2, reasons: [], senderName: null, senderRole: null }, 2);
    expect(e.body).toContain("Hi [First name],");
    expect(e.body).toContain("- [Reason for the strike]");
    expect(e.body).toContain("2 strikes this semester");
    expect(e.body).toContain("[Your name]\n[Your role]");
  });

  it("greets by first name", () => {
    expect(greetingName("Char'Lese Wakefield")).toBe("Char'Lese");
    expect(greetingName("  ")).toBe("[First name]");
    expect(greetingName(null)).toBe("[First name]");
  });
});
