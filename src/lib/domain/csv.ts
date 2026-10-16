/** CSV writing with spreadsheet-formula injection protection. */

export type Column<T> = { key: string; label: string; value: (row: T) => unknown };

/**
 * Cells starting with = + - @ (or tab/CR) are prefixed with an apostrophe so
 * Excel/Sheets never execute them as formulas (CSV injection).
 */
export function safeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return s;
}

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => quote(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => quote(safeCell(c.value(r)))).join(","));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
