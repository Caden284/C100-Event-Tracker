/**
 * Reads C100_Membership_Tracker.xlsx (all eight worksheets) and builds the JSON
 * payload for public.commit_workbook_migration(), plus a preview and warnings.
 *
 * Rules followed:
 *   * Formula columns (counts, Standing, Strike Status, Dues Status…) are NOT
 *     imported as data. Their cached values are only used to VERIFY that the
 *     app's recalculation matches what the workbook showed.
 *   * Blank values stay blank. Nothing is invented.
 *   * People are never merged on similar names — possible duplicates are reported.
 *   * The workbook's standards and strike thresholds become a DRAFT policy.
 */
import ExcelJS from "exceljs";
import { parseFlexibleDate, parseTimeRange } from "../domain/dates";
import { isValidEmail, normalizeEmail, normalizeText } from "../domain/normalize";
import { type PolicyRules, workbookDraftRules } from "../domain/policy";
import { cellToString, sha256 } from "../domain/tabular";

export const EXPECTED_SHEETS = [
  "Dashboard", "Settings", "Events", "Attendance Log", "Members", "Prospective Members", "Unmatched Scans", "How To Use",
] as const;

export type Warning = { level: "error" | "warning" | "info"; sheet: string; message: string };

export type WbEvent = {
  legacy_key: string; name: string; event_date: string | null; start_time: string | null; end_time: string | null;
  time_note: string | null; location: string | null; category_key: string | null; pin_name: string | null;
  notes: string | null; planning_status: string; attendance_source: string; row: number;
};
export type WbPerson = {
  legacy_key: string; kind: "member" | "prospect"; first_name: string | null; last_name: string | null; email: string | null;
  eboard_role?: string | null; committee?: string | null; status_key?: string | null; dues_paid?: "Y" | "N" | null;
  strikes?: number | null; notes?: string | null; first_seen?: string | null; converted?: string | null; row: number;
};
export type WbAttendance = {
  legacy_key: string; pin_event_name: string | null; event_date: string | null; first_name: string | null; last_name: string | null;
  email: string | null; status_key: string | null; marked_by: string | null; marked_on: string | null; card_id: string | null; row: number;
};
export type WbUnmatched = { legacy_key: string; first_name: string | null; last_name: string | null; email: string | null; event: string | null; date: string | null; action: string | null };

export type MigrationPayload = {
  file_name: string;
  file_sha256: string;
  semester: { name: string; term: string; academic_year: string; start_date: string; end_date: string; dues_deadline: string | null };
  policy: { name: string; summary: string; rules: PolicyRules };
  events: WbEvent[];
  people: WbPerson[];
  attendance: WbAttendance[];
  unmatched: WbUnmatched[];
  warnings: Warning[];
};

export type Verification = {
  checked: number;
  mismatches: { name: string; field: string; workbook: number; app: number }[];
  dashboard: { label: string; workbook: unknown }[];
};

export type ParsedWorkbook = {
  payload: MigrationPayload;
  sheets: { name: string; rows: number; present: boolean }[];
  counts: Record<string, number>;
  verification: Verification;
  reference: { label: string; text: string }[];
};

const CATEGORY_MAP: Record<string, string> = {
  meeting: "meeting", general: "general", service: "service", mentoring: "mentoring", study: "study", recruitment: "recruitment",
};
const STATUS_MAP: Record<string, string> = {
  active: "active", "not verified": "not_verified", inactive: "inactive", graduated: "graduated", removed: "removed",
};

function readSheet(ws: ExcelJS.Worksheet | undefined): { raw: unknown[][]; text: string[][] } {
  const raw: unknown[][] = [];
  const text: string[][] = [];
  if (!ws) return { raw, text };
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals = (row.values as unknown[]).slice(1);
    raw[n - 1] = vals.map((v) => (v && typeof v === "object" && "result" in (v as object) ? { formula: true, result: (v as { result: unknown }).result } : v));
    text[n - 1] = vals.map(cellToString);
  });
  for (let i = 0; i < raw.length; i++) if (!raw[i]) { raw[i] = []; text[i] = []; }
  return { raw, text };
}

const s = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};
const isFormula = (v: unknown) => !!v && typeof v === "object" && (v as { formula?: boolean }).formula === true;
const cached = (v: unknown): number | null => {
  if (isFormula(v)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" ? r : null;
  }
  return typeof v === "number" ? v : null;
};

function defaultSemesterDates(term: string, year: number) {
  if (term === "Spring") return { start: `${year}-01-08`, end: `${year}-05-10` };
  if (term === "Summer") return { start: `${year}-05-15`, end: `${year}-08-10` };
  return { start: `${year}-08-15`, end: `${year}-12-15` };
}

export async function parseWorkbook(data: Uint8Array, fileName: string): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  const warnings: Warning[] = [];
  const sheets = EXPECTED_SHEETS.map((name) => {
    const ws = wb.getWorksheet(name);
    return { name, present: !!ws, rows: ws ? ws.actualRowCount : 0 };
  });
  for (const sh of sheets) {
    if (!sh.present) {
      const core = ["Events", "Attendance Log", "Members", "Prospective Members", "Settings"].includes(sh.name);
      warnings.push({ level: core ? "error" : "warning", sheet: sh.name, message: `Worksheet "${sh.name}" was not found.` });
    }
  }
  if (warnings.some((w) => w.level === "error")) {
    throw new Error(warnings.filter((w) => w.level === "error").map((w) => w.message).join(" "));
  }

  // ------------------------------------------------------------- Settings
  const settings = readSheet(wb.getWorksheet("Settings"));
  const setting = (label: RegExp) => {
    const row = settings.raw.findIndex((r) => r && typeof r[0] === "string" && label.test(r[0] as string));
    return row >= 0 ? settings.raw[row][1] : undefined;
  };
  const num = (v: unknown, fallback: number, label: string) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    warnings.push({ level: "warning", sheet: "Settings", message: `"${label}" not found — using ${fallback}.` });
    return fallback;
  };
  const req = {
    meetings: num(setting(/^meetings required/i), 2, "Meetings required"),
    general: num(setting(/^general events required/i), 3, "General events required"),
    service: num(setting(/^service events required/i), 3, "Service events required"),
    mentoring: num(setting(/^mentoring.*required/i), 3, "Mentoring required"),
  };
  const duesDeadline = parseFlexibleDate(setting(/^dues deadline/i));
  const titleText = [settings.text[1]?.[0], settings.text[0]?.[0], readSheet(wb.getWorksheet("Dashboard")).text[0]?.[0]].join(" ");
  const termMatch = titleText.match(/(Fall|Spring|Summer)\s+(\d{4})/i);
  const term = termMatch ? termMatch[1][0].toUpperCase() + termMatch[1].slice(1).toLowerCase() : "Fall";
  const year = termMatch ? Number(termMatch[2]) : new Date().getFullYear();
  if (!termMatch) warnings.push({ level: "warning", sheet: "Settings", message: `Semester name not found — assuming ${term} ${year}. You can rename it later.` });

  // ------------------------------------------------------------- Events
  const ev = readSheet(wb.getWorksheet("Events"));
  const events: WbEvent[] = [];
  const pinToCategory = new Map<string, string | null>();
  const eventKeys = new Set<string>();
  for (let i = 1; i < ev.text.length; i++) {
    const t = ev.text[i];
    const name = s(t[1]);
    if (!name) continue;
    const date = parseFlexibleDate(ev.raw[i][0]);
    const time = parseTimeRange(t[2]);
    const rawCat = normalizeText(t[4]);
    const category = rawCat ? CATEGORY_MAP[rawCat] ?? null : null;
    if (rawCat && !category) warnings.push({ level: "warning", sheet: "Events", message: `Row ${i + 1} "${name}": unknown category "${t[4]}" — left blank.` });
    if (!rawCat) warnings.push({ level: "warning", sheet: "Events", message: `Row ${i + 1} "${name}" has no category.` });
    const notes = s(t[10]);
    const pin = s(t[5]);
    let key = `wb:events:${normalizeText(name)}:${date ?? "tbd"}`;
    if (eventKeys.has(key)) key += `:row${i + 1}`;
    eventKeys.add(key);
    const location = s(t[3]);
    events.push({
      legacy_key: key,
      name,
      event_date: date,
      start_time: time.start,
      end_time: time.end,
      time_note: time.note,
      location: location && /^tbd$|^location tbd$/i.test(location) ? null : location,
      category_key: category,
      pin_name: pin,
      notes,
      planning_status: /pending/i.test(notes ?? "") ? "pending_approval" : /^confirmed$/i.test(notes ?? "") ? "confirmed" : "proposed",
      attendance_source: /paper|manual/i.test(notes ?? "") ? "paper" : "pin",
      row: i + 1,
    });
    if (!date) warnings.push({ level: "info", sheet: "Events", message: `"${name}" has no date yet (shown as Date TBD on the calendar).` });
    if (pin) pinToCategory.set(normalizeText(pin)!, category);
  }

  // ------------------------------------------------------------- People
  const people: WbPerson[] = [];
  const personKeys = new Set<string>();
  const emailOwner = new Map<string, string>();
  const nameOwner = new Map<string, string[]>();
  const makeKey = (first: string | null, last: string | null, email: string | null, row: number, sheet: string) => {
    let key = `wb:person:${normalizeText(first) ?? ""}|${normalizeText(last) ?? ""}`;
    if (personKeys.has(key)) key += `|${normalizeEmail(email) ?? `${sheet}-row${row}`}`;
    personKeys.add(key);
    return key;
  };
  const noteIdentity = (first: string | null, last: string | null, email: string | null, where: string) => {
    const e = normalizeEmail(email);
    if (e && isValidEmail(e)) {
      if (emailOwner.has(e)) warnings.push({ level: "warning", sheet: where, message: `Email ${e} appears more than once (${emailOwner.get(e)} and ${where}). The records share one person.` });
      else emailOwner.set(e, where);
    }
    const n = `${normalizeText(first) ?? ""} ${normalizeText(last) ?? ""}`.trim();
    if (n) nameOwner.set(n, [...(nameOwner.get(n) ?? []), `${where}${e ? ` <${e}>` : ""}`]);
  };

  const mem = readSheet(wb.getWorksheet("Members"));
  const cachedMemberCounts: { email: string | null; name: string; counts: Record<string, number | null> }[] = [];
  for (let i = 1; i < mem.text.length; i++) {
    const t = mem.text[i];
    const first = s(t[0]);
    const last = s(t[1]);
    if (!first && !last) continue;
    const email = s(t[2]);
    const statusRaw = normalizeText(t[5]);
    const status = statusRaw ? STATUS_MAP[statusRaw] ?? null : null;
    if (!status) warnings.push({ level: "warning", sheet: "Members", message: `Row ${i + 1} ${first ?? ""} ${last ?? ""}: status "${t[5] ?? ""}" not recognized — imported as Not Verified.` });
    const dues = normalizeText(t[6]);
    const strikesVal = mem.raw[i][15];
    const strikes = typeof strikesVal === "number" ? strikesVal : null;
    if (strikes && strikes > 0) warnings.push({ level: "info", sheet: "Members", message: `${first} ${last ?? ""} has ${strikes} strike(s) in the workbook. Preserved as historical information; the draft strike policy is NOT activated.` });
    if (!email) warnings.push({ level: "warning", sheet: "Members", message: `${first ?? ""} ${last ?? ""} has no email — attendance cannot be matched until one is added.` });
    else if (!isValidEmail(email)) warnings.push({ level: "warning", sheet: "Members", message: `${first ?? ""} ${last ?? ""}: "${email}" is not a valid email (kept as a placeholder).` });
    if (!last) warnings.push({ level: "info", sheet: "Members", message: `"${first}" has no last name on the roster.` });
    noteIdentity(first, last, email, "Members");
    people.push({
      legacy_key: makeKey(first, last, email, i + 1, "members"),
      kind: "member", first_name: first, last_name: last, email,
      eboard_role: s(t[3]), committee: s(t[4]), status_key: status,
      dues_paid: dues === "y" ? "Y" : dues === "n" ? "N" : null,
      strikes, notes: s(t[17]), row: i + 1,
    });
    cachedMemberCounts.push({
      email: normalizeEmail(email), name: `${first ?? ""} ${last ?? ""}`.trim(),
      counts: { meetings: cached(mem.raw[i][8]), general: cached(mem.raw[i][9]), service: cached(mem.raw[i][10]), mentoring: cached(mem.raw[i][11]), study: cached(mem.raw[i][12]) },
    });
  }

  const pros = readSheet(wb.getWorksheet("Prospective Members"));
  for (let i = 1; i < pros.text.length; i++) {
    const t = pros.text[i];
    const first = s(t[0]);
    const last = s(t[1]);
    if (!first && !last) continue;
    const email = s(t[2]);
    if (email && !isValidEmail(email)) warnings.push({ level: "warning", sheet: "Prospective Members", message: `${first ?? ""} ${last ?? ""}: "${email}" is a placeholder, not an email. Replace it so PIN scans can merge.` });
    if (!email) warnings.push({ level: "warning", sheet: "Prospective Members", message: `${first ?? ""} ${last ?? ""} has no email.` });
    noteIdentity(first, last, email, "Prospective Members");
    people.push({
      legacy_key: makeKey(first, last, email, i + 1, "prospects"),
      kind: "prospect", first_name: first, last_name: last, email,
      first_seen: s(t[5]), converted: s(t[6]), notes: s(t[7]), row: i + 1,
    });
  }
  for (const [n, where] of nameOwner) {
    if (where.length > 1) warnings.push({ level: "warning", sheet: "Members / Prospective Members", message: `Possible duplicate: "${n}" appears ${where.length} times (${where.join("; ")}). Not merged — review manually.` });
  }

  // ------------------------------------------------------------- Attendance Log
  const log = readSheet(wb.getWorksheet("Attendance Log"));
  const attendance: WbAttendance[] = [];
  const knownPins = new Set(events.map((e) => normalizeText(e.pin_name)).filter(Boolean) as string[]);
  const knownEmails = new Set(people.map((p) => normalizeText(p.email)).filter(Boolean) as string[]);
  const missingPins = new Map<string, number>();
  let unknownPeople = 0;
  const cardOwners = new Map<string, Set<string>>();
  for (let i = 1; i < log.text.length; i++) {
    const t = log.text[i];
    const pin = s(t[0]);
    const email = s(t[4]);
    if (!pin && !email && !s(t[2])) continue;
    const statusRaw = normalizeText(t[5]);
    const statusKey = statusRaw === "attended" ? "attended" : statusRaw === "absent" ? "absent" : statusRaw === "excused" ? "excused" : statusRaw ? null : "attended";
    if (statusRaw && !statusKey) warnings.push({ level: "warning", sheet: "Attendance Log", message: `Row ${i + 1}: status "${t[5]}" not recognized — row will need review.` });
    const date = parseFlexibleDate(log.raw[i][1]);
    if (pin && !knownPins.has(normalizeText(pin)!)) missingPins.set(pin, (missingPins.get(pin) ?? 0) + 1);
    if (!email || !knownEmails.has(normalizeText(email)!)) unknownPeople += 1;
    const card = s(t[8]);
    if (card) {
      const set = cardOwners.get(card) ?? new Set<string>();
      set.add(normalizeText(email) ?? `row${i + 1}`);
      cardOwners.set(card, set);
    }
    attendance.push({
      legacy_key: `${normalizeText(pin) ?? ""}|${date ?? ""}|${normalizeText(email) ?? ""}|${i + 1}`,
      pin_event_name: pin, event_date: date, first_name: s(t[2]), last_name: s(t[3]), email,
      status_key: statusKey, marked_by: s(t[6]), marked_on: s(t[7]), card_id: card, row: i + 1,
    });
  }
  for (const [pin, n] of missingPins) warnings.push({ level: "warning", sheet: "Attendance Log", message: `${n} row(s) use PIN event "${pin}", which is not on the Events tab — they will go to the review queue.` });
  if (unknownPeople) warnings.push({ level: "warning", sheet: "Attendance Log", message: `${unknownPeople} row(s) have an email not on Members or Prospective Members — they will go to the review queue.` });
  for (const [card, owners] of cardOwners) {
    if (owners.size > 1) warnings.push({ level: "info", sheet: "Attendance Log", message: `Card ID "${card}" is shared by ${owners.size} different people, so it is not used as an identifier.` });
  }

  // ------------------------------------------------------------- Unmatched Scans
  const um = readSheet(wb.getWorksheet("Unmatched Scans"));
  const unmatched: WbUnmatched[] = [];
  for (let i = 1; i < um.text.length; i++) {
    const t = um.text[i];
    if (!s(t[0]) && !s(t[1]) && !s(t[2])) continue;
    const date = parseFlexibleDate(um.raw[i][4]);
    unmatched.push({
      legacy_key: `${normalizeText(t[0]) ?? ""}|${normalizeText(t[1]) ?? ""}|${normalizeText(t[3]) ?? ""}|${date ?? ""}`,
      first_name: s(t[0]), last_name: s(t[1]), email: s(t[2]), event: s(t[3]), date, action: s(t[5]),
    });
  }

  // ------------------------------------------------------------- How To Use / Dashboard (reference only)
  const how = readSheet(wb.getWorksheet("How To Use"));
  const reference: { label: string; text: string }[] = [];
  for (const r of how.text) {
    const label = s(r?.[0]);
    const text = s(r?.[1]);
    if (label && text) reference.push({ label, text });
  }
  for (const r of reference) {
    if (/^(removed from groupme list|graduated|advisors)/i.test(r.label)) {
      warnings.push({ level: "info", sheet: "How To Use", message: `Roster decision "${r.label}": ${r.text} — recorded for reference; these people are not on the Members tab and are not imported as records.` });
    }
  }
  const dash = readSheet(wb.getWorksheet("Dashboard"));
  const dashboard = dash.raw
    .map((r, i) => ({ label: dash.text[i]?.[0], value: r?.[1] }))
    .filter((r) => r.label && r.value !== undefined && r.value !== null)
    .map((r) => ({ label: r.label!, workbook: isFormula(r.value) ? (r.value as { result: unknown }).result : r.value }));

  // ------------------------------------------------------------- Semester window
  const sorted = (events.map((e) => e.event_date).filter(Boolean) as string[]).sort();
  const def = defaultSemesterDates(term, year);
  const start = sorted.length && sorted[0] < def.start ? sorted[0] : def.start;
  const end = sorted.length && sorted[sorted.length - 1] > def.end ? sorted[sorted.length - 1] : def.end;
  const academicYear = term === "Fall" ? `${year}-${year + 1}` : `${year - 1}-${year}`;

  // ------------------------------------------------------------- Verification against cached formulas
  const reqByCat: Record<string, string> = { meeting: "meetings", general: "general", service: "service", mentoring: "mentoring", study: "study" };
  const appCounts = new Map<string, Record<string, Set<string>>>();
  for (const a of attendance) {
    if (a.status_key !== "attended" || !a.email) continue;
    const cat = pinToCategory.get(normalizeText(a.pin_event_name) ?? "");
    const field = cat ? reqByCat[cat] : undefined;
    if (!field) continue;
    const e = normalizeEmail(a.email)!;
    const rec = appCounts.get(e) ?? {};
    (rec[field] ??= new Set()).add(`${normalizeText(a.pin_event_name)}|${a.event_date}`);
    appCounts.set(e, rec);
  }
  const mismatches: Verification["mismatches"] = [];
  let checked = 0;
  for (const m of cachedMemberCounts) {
    if (!m.email) continue;
    checked += 1;
    for (const [field, wbVal] of Object.entries(m.counts)) {
      if (wbVal === null) continue;
      const app = appCounts.get(m.email)?.[field]?.size ?? 0;
      if (app !== wbVal) mismatches.push({ name: m.name, field, workbook: wbVal, app });
    }
  }

  const payload: MigrationPayload = {
    file_name: fileName,
    file_sha256: sha256(data),
    semester: { name: `${term} ${year}`, term, academic_year: academicYear, start_date: start, end_date: end, dues_deadline: duesDeadline },
    policy: {
      name: "Membership standards",
      summary: `Imported from ${fileName} (Settings tab). Workbook values — NOT yet approved by the executive board.`,
      rules: workbookDraftRules(req),
    },
    events, people, attendance, unmatched, warnings,
  };

  return {
    payload,
    sheets,
    counts: {
      events: events.length,
      members: people.filter((p) => p.kind === "member").length,
      prospects: people.filter((p) => p.kind === "prospect").length,
      attendance: attendance.length,
      unmatched: unmatched.length,
      members_without_email: people.filter((p) => p.kind === "member" && !p.email).length,
    },
    verification: { checked, mismatches, dashboard },
    reference,
  };
}
