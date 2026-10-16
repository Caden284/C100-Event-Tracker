/**
 * Column detection for PIN (Panther Involvement Network) attendance exports.
 * PIN exports differ in column order and naming, and not every export has every
 * field. Detection is a suggestion: the officer can correct it in the wizard.
 */

export const IMPORT_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "card_id",
  "event_name",
  "event_date",
  "status",
  "marked_by",
  "marked_on",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (single column)",
  email: "Email",
  card_id: "Card ID / Panther ID",
  event_name: "Event name",
  event_date: "Event date",
  status: "Attendance status",
  marked_by: "Marked by",
  marked_on: "Marked on (scan time)",
};

// Ordered most-specific first. Exact matches beat partial matches.
const SYNONYMS: Record<ImportField, string[]> = {
  first_name: ["first name", "firstname", "first", "given name", "preferred first name", "legal first name"],
  last_name: ["last name", "lastname", "last", "surname", "family name", "legal last name"],
  full_name: ["full name", "name", "attendee", "attendee name", "student name", "member name", "user name"],
  email: ["campus email", "email", "email address", "e mail", "school email", "student email", "primary email", "user email", "preferred email"],
  card_id: ["card id", "card id number", "card number", "card", "student id", "panther id", "campus id", "id number", "swipe id"],
  event_name: ["pin event name", "event name", "event title", "event", "title"],
  event_date: ["event date", "event start", "event start date", "start date", "date"],
  status: ["attendance status", "status", "attendance", "attended"],
  marked_by: ["marked by", "checked in by", "scanned by", "recorded by", "swiped by"],
  marked_on: ["marked on", "checked in at", "check in time", "scanned at", "scan time", "swipe time", "timestamp", "date marked", "marked at"],
};

export type ColumnMapping = Partial<Record<ImportField, number | null>>;
export type Confidence = "high" | "medium" | "none";

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-./()#:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function detectColumns(headers: string[]): { mapping: ColumnMapping; confidence: Partial<Record<ImportField, Confidence>> } {
  const norm = headers.map((h) => normalizeHeader(h ?? ""));
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const confidence: Partial<Record<ImportField, Confidence>> = {};

  // Pass 1: exact synonym matches, in synonym priority order.
  for (const field of IMPORT_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h === syn);
      if (idx >= 0) {
        mapping[field] = idx;
        confidence[field] = "high";
        used.add(idx);
        break;
      }
    }
  }
  // Pass 2: partial matches for whatever is still missing (lower confidence).
  for (const field of IMPORT_FIELDS) {
    if (mapping[field] !== undefined) continue;
    for (const syn of SYNONYMS[field]) {
      if (syn.length < 4) continue;
      const idx = norm.findIndex((h, i) => !used.has(i) && h.includes(syn));
      if (idx >= 0) {
        mapping[field] = idx;
        confidence[field] = "medium";
        used.add(idx);
        break;
      }
    }
    if (mapping[field] === undefined) {
      mapping[field] = null;
      confidence[field] = "none";
    }
  }
  // A single "Name" column is only needed when first/last are missing.
  if (mapping.first_name != null && mapping.last_name != null && confidence.full_name !== "high") {
    mapping.full_name = null;
    confidence.full_name = "none";
  }
  return { mapping, confidence };
}

/** Problems that must be fixed (or explicitly accepted) before previewing. */
export function mappingProblems(mapping: ColumnMapping): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const has = (f: ImportField) => mapping[f] !== null && mapping[f] !== undefined;
  if (!has("email") && !has("card_id")) {
    warnings.push("No email or card ID column: every row will need manual review in the unmatched queue.");
  }
  if (!has("first_name") && !has("last_name") && !has("full_name") && !has("email")) {
    blocking.push("Map at least a name or an email column.");
  }
  if (!has("status")) warnings.push("No attendance-status column: choose the status every row represents.");
  if (!has("event_name")) warnings.push("No event-name column: you will choose the event for the whole file.");
  const seen = new Map<number, ImportField>();
  for (const f of IMPORT_FIELDS) {
    const idx = mapping[f];
    if (idx === null || idx === undefined) continue;
    if (seen.has(idx)) blocking.push(`"${f}" and "${seen.get(idx)}" are mapped to the same column.`);
    seen.set(idx, f);
  }
  return { blocking, warnings };
}

/** Finds the header row: the first of the first 10 rows containing ≥2 recognizable headers. */
export function findHeaderRow(rows: string[][]): number {
  const all = new Set(Object.values(SYNONYMS).flat());
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const hits = rows[i].filter((c) => c && all.has(normalizeHeader(String(c)))).length;
    if (hits >= 2) return i;
  }
  return 0;
}
