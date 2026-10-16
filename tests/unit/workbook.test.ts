import { describe, expect, it } from "vitest";
import { parseWorkbook } from "@/lib/workbook/parse-workbook";
import { buildSampleWorkbook } from "../fixtures/sample-workbook";

describe("workbook migration parser", () => {
  it("reads all eight worksheets and builds the payload", async () => {
    const r = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    expect(r.sheets.every((s) => s.present)).toBe(true);
    expect(r.counts).toMatchObject({ events: 5, members: 3, prospects: 2, attendance: 7, unmatched: 1, members_without_email: 1 });
    expect(r.payload.semester).toMatchObject({ name: "Fall 2026", academic_year: "2026-2027", dues_deadline: "2026-10-08" });
  });
  it("imports settings as a DRAFT policy with strikes inactive", async () => {
    const { payload } = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    expect(payload.policy.rules.requirements.map((r) => r.required)).toEqual([2, 3, 3, 3]);
    expect(payload.policy.rules.strikes.enabled).toBe(false);
    expect(payload.policy.summary).toMatch(/NOT yet approved/);
  });
  it("never imports formula strings as data and keeps blanks blank", async () => {
    const { payload } = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/COUNTIF|IF\(/);
    const jordan = payload.people.find((p) => p.first_name === "Jordan")!;
    expect(jordan.email).toBeNull();
    expect(jordan.last_name).toBeNull();
    expect(jordan.dues_paid).toBeNull();
    expect(jordan.status_key).toBe("not_verified");
  });
  it("preserves strike counts as history and reports data-quality issues", async () => {
    const { payload } = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    expect(payload.people.find((p) => p.first_name === "Blair")!.strikes).toBe(1);
    const msgs = payload.warnings.map((w) => w.message).join("\n");
    expect(msgs).toMatch(/Jordan\s+has no email/);
    expect(msgs).toMatch(/placeholder/);
    expect(msgs).toMatch(/Unknown Event Name/);
    expect(msgs).toMatch(/Card ID "MANUAL" is shared/);
    expect(msgs).toMatch(/draft strike policy is NOT activated/);
    expect(msgs).toMatch(/Graduated/);
  });
  it("parses event details from the Events tab", async () => {
    const { payload } = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    const kick = payload.events.find((e) => e.name.startsWith("Kickoff"))!;
    expect(kick).toMatchObject({ event_date: "2026-09-02", start_time: "17:30", end_time: "19:00", category_key: "meeting", pin_name: "Kickoff: General Body Meeting" });
    expect(payload.events.find((e) => e.name === "Wellness Pilates")!.planning_status).toBe("pending_approval");
    expect(payload.events.find((e) => e.name === "Park Clean Up")!.attendance_source).toBe("paper");
    expect(payload.events.find((e) => e.name === "Community Impact Day")!.event_date).toBeNull();
  });
  it("verifies the app's recalculation against the workbook's cached formulas", async () => {
    const ok = await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx");
    expect(ok.verification.checked).toBe(2);
    expect(ok.verification.mismatches).toEqual([]);
    const off = await parseWorkbook(await buildSampleWorkbook({ meetingsCached: 5 }), "sample.xlsx");
    expect(off.verification.mismatches).toEqual([{ name: "Alex Rivera", field: "meetings", workbook: 5, app: 1 }]);
  });
  it("fails safely on a file that is not the tracker", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1").addRow(["hello"]);
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    await expect(parseWorkbook(buf, "x.xlsx")).rejects.toThrow(/Events/);
    await expect(parseWorkbook(new Uint8Array([1, 2, 3]), "x.xlsx")).rejects.toThrow();
  });
});
