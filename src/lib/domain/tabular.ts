/**
 * Safe parsing of uploaded CSV / XLSX files. Files are validated by CONTENT
 * (magic bytes, text encoding, structure) — never just by their extension.
 * Server-only (uses exceljs), but has no Next.js dependencies so it is unit-testable.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { createHash } from "node:crypto";

export type FileKind = "csv" | "xlsx";

export class FileValidationError extends Error {}

export type ParsedTable = {
  kind: FileKind;
  sheetName: string | null;
  rows: string[][]; // all non-empty rows, cells as trimmed strings
  sha256: string;
  size: number;
};

export function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sniffKind(buf: Uint8Array): FileKind | "xls" | "binary" {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "xlsx";
  if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "xls";
  const head = buf.subarray(0, Math.min(buf.length, 8192));
  for (const b of head) if (b === 0) return "binary";
  return "csv";
}

export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToString(o.result); // formula → cached value
    if ("text" in o && typeof o.text === "string") return o.text.trim(); // hyperlink
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("error" in o) return "";
    return "";
  }
  return String(v).trim();
}

export async function parseTabularFile(
  data: Uint8Array,
  opts: { maxBytes: number; maxRows: number; sheetName?: string },
): Promise<ParsedTable> {
  if (data.length === 0) throw new FileValidationError("The file is empty.");
  if (data.length > opts.maxBytes) {
    throw new FileValidationError(`The file is larger than ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`);
  }
  const kind = sniffKind(data);
  if (kind === "xls") throw new FileValidationError("Old .xls files are not supported. In Excel choose File → Save As → .xlsx or CSV.");
  if (kind === "binary") throw new FileValidationError("This does not look like a CSV or Excel file.");

  let rows: string[][] = [];
  let sheetName: string | null = null;
  if (kind === "xlsx") {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
    } catch {
      throw new FileValidationError("The Excel file could not be read. It may be corrupted or password protected.");
    }
    const ws = opts.sheetName ? wb.getWorksheet(opts.sheetName) : wb.worksheets[0];
    if (!ws) throw new FileValidationError("The workbook has no readable worksheet.");
    sheetName = ws.name;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1); // exceljs rows are 1-indexed
      rows.push(values.map(cellToString));
    });
  } else {
    let text = new TextDecoder("utf-8", { fatal: false }).decode(data);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (res.errors.some((e) => e.type === "Quotes")) {
      throw new FileValidationError("The CSV has unbalanced quotes and cannot be read safely.");
    }
    rows = res.data.map((r) => r.map((c) => (c ?? "").toString().trim()));
  }
  rows = rows.filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) throw new FileValidationError("The file needs a header row and at least one data row.");
  if (rows.length - 1 > opts.maxRows) throw new FileValidationError(`The file has more than ${opts.maxRows} rows.`);
  const width = Math.max(...rows.map((r) => r.length));
  if (width > 100) throw new FileValidationError("The file has too many columns to be an attendance export.");
  rows = rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill("")] : r));
  return { kind, sheetName, rows, sha256: sha256(data), size: data.length };
}
