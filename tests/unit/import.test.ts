import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { detectColumns, findHeaderRow, mappingProblems } from "@/lib/domain/columns";
import { buildImportRows, groupRows } from "@/lib/domain/import-rows";
import { FileValidationError, parseTabularFile, sniffKind } from "@/lib/domain/tabular";
import { safeCell, toCsv } from "@/lib/domain/csv";

const PIN_HEADERS = ["First Name", "Last Name", "Campus Email", "Preferred Email", "Card ID Number", "Attendance Status", "Marked By", "Marked On", "Event Name"];
const enc = (s: string) => new TextEncoder().encode(s);
const limits = { maxBytes: 1024 * 1024, maxRows: 100 };

describe("column detection", () => {
  it("detects PIN columns regardless of order and prefers campus email", () => {
    const { mapping, confidence } = detectColumns([...PIN_HEADERS].reverse());
    const h = [...PIN_HEADERS].reverse();
    expect(h[mapping.email!]).toBe("Campus Email");
    expect(h[mapping.card_id!]).toBe("Card ID Number");
    expect(h[mapping.status!]).toBe("Attendance Status");
    expect(h[mapping.event_name!]).toBe("Event Name");
    expect(confidence.email).toBe("high");
    expect(mapping.event_date).toBeNull();
  });
  it("does not assume every field exists and warns about missing ones", () => {
    const { mapping } = detectColumns(["Name", "Email"]);
    expect(mapping.full_name).toBe(0);
    const p = mappingProblems(mapping);
    expect(p.blocking).toHaveLength(0);
    expect(p.warnings.join(" ")).toMatch(/status/);
    expect(p.warnings.join(" ")).toMatch(/event-name/);
  });
  it("blocks two fields mapped to one column", () => {
    expect(mappingProblems({ email: 1, card_id: 1 }).blocking.length).toBe(1);
  });
  it("skips title rows above the header", () => {
    expect(findHeaderRow([["Event Attendance Report"], [""], PIN_HEADERS, ["a"]])).toBe(2);
  });
});

describe("row normalization and fingerprints", () => {
  const { mapping } = detectColumns(PIN_HEADERS);
  const row = (email: string, status = "Attended") => ["Jordan", "Doe", email, "", "001234567", status, "Officer A", "9/2/2026 9:27 AM", "Meet the 100"];
  it("normalizes email casing/whitespace so re-uploads fingerprint identically", () => {
    const [a, b] = buildImportRows(PIN_HEADERS, [row(" JDoe2@student.gsu.edu "), row("jdoe2@student.gsu.edu")], mapping);
    expect(a.email_normalized).toBe("jdoe2@student.gsu.edu");
    expect(a.fingerprint).toBe(b.fingerprint);
  });
  it("different statuses produce different fingerprints", () => {
    const [a, b] = buildImportRows(PIN_HEADERS, [row("x@student.gsu.edu"), row("x@student.gsu.edu", "Absent")], mapping);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
  it("groups rows by event name and date; files without an event column form one group", () => {
    const rows = buildImportRows(PIN_HEADERS, [row("a@x.edu"), row("b@x.edu")], mapping);
    expect(groupRows(rows)).toHaveLength(1);
    const noEvent = buildImportRows(["Email"], [["a@x.edu"], ["b@x.edu"]], { email: 0 });
    expect(groupRows(noEvent)[0].group_key).toBe("__file__|");
  });
});

describe("safe file parsing", () => {
  it("parses CSV with a BOM and quoted commas", async () => {
    const t = await parseTabularFile(enc('﻿First Name,Last Name,Email\n"Smith, Jr",Kaia,k@x.edu\n'), limits);
    expect(t.kind).toBe("csv");
    expect(t.rows[0][0]).toBe("First Name");
    expect(t.rows[1][0]).toBe("Smith, Jr");
  });
  it("parses xlsx by content (magic bytes), not by name", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Export");
    ws.addRow(["First Name", "Email", "Date"]);
    ws.addRow(["Ann", "ann@x.edu", new Date(Date.UTC(2026, 8, 2))]);
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(sniffKind(buf)).toBe("xlsx");
    const t = await parseTabularFile(buf, limits);
    expect(t.rows[1]).toEqual(["Ann", "ann@x.edu", "2026-09-02"]);
  });
  it("rejects binary, legacy .xls, empty and oversized files", async () => {
    await expect(parseTabularFile(new Uint8Array([0, 1, 2, 3, 0]), limits)).rejects.toBeInstanceOf(FileValidationError);
    await expect(parseTabularFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1]), limits)).rejects.toThrow(/xls/);
    await expect(parseTabularFile(new Uint8Array(), limits)).rejects.toThrow(/empty/);
    await expect(parseTabularFile(enc("a\n" + "x\n".repeat(200)), limits)).rejects.toThrow(/more than 100 rows/);
    await expect(parseTabularFile(enc("a,b\n1,2\n"), { maxBytes: 3, maxRows: 10 })).rejects.toThrow(/larger/);
  });
});

describe("CSV export safety", () => {
  it("neutralizes spreadsheet formula injection", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(safeCell("+1")).toBe("'+1");
    expect(safeCell("-5")).toBe("-5");
    const csv = toCsv([{ a: "=1+1", b: 'say "hi"' }], [{ key: "a", label: "A", value: (r) => r.a }, { key: "b", label: "B", value: (r) => r.b }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"say ""hi"""');
  });
});
