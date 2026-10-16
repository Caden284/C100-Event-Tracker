/**
 * Turns raw file rows + a column mapping into normalized import rows.
 * Pure function: the database (classify_attendance_import) then matches events
 * and people and decides each row's outcome.
 */
import { createHash } from "node:crypto";
import type { ColumnMapping, ImportField } from "./columns";
import { parseFlexibleDate } from "./dates";
import { cleanCell, normalizeEmail, normalizeText, splitFullName } from "./normalize";

export type NormalizedImportRow = {
  row_number: number; // 1-based data row number (header excluded)
  raw: Record<string, string>;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_normalized: string | null;
  card_id: string | null;
  pin_event_name: string | null;
  event_date: string | null;
  event_date_raw: string | null;
  status_raw: string | null;
  marked_by: string | null;
  marked_on: string | null;
  group_key: string;
  fingerprint: string;
};

export const FILE_GROUP = "__file__";

export function groupKeyFor(eventName: string | null, eventDate: string | null): string {
  return `${normalizeText(eventName) ?? FILE_GROUP}|${eventDate ?? ""}`;
}

export function rowFingerprint(r: Pick<NormalizedImportRow, "pin_event_name" | "event_date" | "email_normalized" | "card_id" | "status_raw" | "first_name" | "last_name">): string {
  const parts = [
    normalizeText(r.pin_event_name) ?? "",
    r.event_date ?? "",
    r.email_normalized ?? "",
    (r.card_id ?? "").trim(),
    normalizeText(r.status_raw) ?? "",
    // names only matter when there is no identifier at all
    r.email_normalized || r.card_id ? "" : `${normalizeText(r.first_name) ?? ""} ${normalizeText(r.last_name) ?? ""}`,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function buildImportRows(
  headers: string[],
  dataRows: string[][],
  mapping: ColumnMapping,
  opts: { fileEventName?: string | null; fileEventDate?: string | null } = {},
): NormalizedImportRow[] {
  const get = (row: string[], f: ImportField) => {
    const idx = mapping[f];
    return idx === null || idx === undefined ? null : cleanCell(row[idx]);
  };
  return dataRows.map((row, i) => {
    let first = get(row, "first_name");
    let last = get(row, "last_name");
    if (!first && !last) {
      const split = splitFullName(get(row, "full_name"));
      first = split.first;
      last = split.last;
    }
    const email = get(row, "email");
    const dateRaw = get(row, "event_date") ?? opts.fileEventDate ?? null;
    const eventDate = parseFlexibleDate(dateRaw);
    const eventName = get(row, "event_name") ?? opts.fileEventName ?? null;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h || `Column ${idx + 1}`] = row[idx] ?? "";
    });
    const base = {
      row_number: i + 1,
      raw,
      first_name: first,
      last_name: last,
      email,
      email_normalized: normalizeEmail(email),
      card_id: get(row, "card_id"),
      pin_event_name: eventName,
      event_date: eventDate,
      event_date_raw: dateRaw,
      status_raw: get(row, "status"),
      marked_by: get(row, "marked_by"),
      marked_on: get(row, "marked_on"),
      group_key: groupKeyFor(eventName, eventDate),
    };
    return { ...base, fingerprint: rowFingerprint(base) };
  });
}

export type EventGroup = { group_key: string; pin_event_name: string | null; event_date: string | null; rows: number };

export function groupRows(rows: NormalizedImportRow[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const r of rows) {
    const g = map.get(r.group_key) ?? { group_key: r.group_key, pin_event_name: r.pin_event_name, event_date: r.event_date, rows: 0 };
    g.rows += 1;
    map.set(r.group_key, g);
  }
  return [...map.values()].sort((a, b) => b.rows - a.rows);
}
