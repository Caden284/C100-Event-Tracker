/**
 * Date/time parsing for PIN exports and the workbook. All calendar dates are
 * handled as plain 'YYYY-MM-DD' strings to avoid time-zone drift.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial date (days since 1899-12-30) → ISO date. */
export function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 120000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Accepts: Date objects, Excel serials, 'YYYY-MM-DD[...]', 'M/D/YYYY[ h:mm AM]',
 * 'M/D/YY', 'Sep 2, 2026', '2 Sep 2026'. Returns null when it cannot be read.
 */
export function parseFlexibleDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") return fromExcelSerial(value);
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += 2000;
    return isoDate(y, +m[1], +m[2]);
  }
  const month = (name: string) => {
    const k = name.toLowerCase();
    return MONTHS[k.slice(0, 4)] ?? MONTHS[k.slice(0, 3)];
  };
  m = s.match(/^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (m && month(m[1])) return isoDate(+m[3], month(m[1]), +m[2]);
  m = s.match(/^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/i);
  if (m && month(m[2])) return isoDate(+m[3], month(m[2]), +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  return null;
}

type Clock = { h: number; m: number; ampm: "am" | "pm" | null };

function parseClock(s: string): Clock | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  const h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  const ampm = m[3] ? (m[3].startsWith("a") ? "am" : "pm") : null;
  return { h, m: min, ampm };
}

function to24(c: Clock, ampm: "am" | "pm" | null): string {
  let h = c.h;
  const mer = c.ampm ?? ampm;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return `${pad(h)}:${pad(c.m)}`;
}

/**
 * Parses workbook/calendar time text such as "5:30-7:00 PM", "10:00 AM-1:00 PM",
 * "12:00 PM - until", "Time TBD". Unparseable text is kept as a note.
 */
export function parseTimeRange(text: unknown): { start: string | null; end: string | null; note: string | null } {
  const raw = text === null || text === undefined ? "" : String(text).trim();
  if (!raw) return { start: null, end: null, note: null };
  if (/tbd|tba/i.test(raw)) return { start: null, end: null, note: raw };
  const parts = raw.split(/\s*(?:-|–|—|to)\s*/i);
  const a = parseClock(parts[0] ?? "");
  if (!a) return { start: null, end: null, note: raw };
  const bText = parts[1] ?? "";
  const b = parseClock(bText);
  if (!b) {
    const start = to24(a, a.ampm);
    return { start, end: null, note: bText ? raw : null };
  }
  const endMer = b.ampm;
  let startMer = a.ampm ?? endMer;
  // "11:00-1:00 PM": applying PM to the start would put it after the end → use AM.
  if (!a.ampm && endMer === "pm") {
    const startPm = to24(a, "pm");
    const end = to24(b, endMer);
    if (startPm > end) startMer = "am";
  }
  return { start: to24(a, startMer), end: to24(b, endMer), note: null };
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  const mer = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${pad(mm)} ${mer}`;
}

export function formatTimeRange(start?: string | null, end?: string | null, note?: string | null): string {
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return note && /until/i.test(note) ? `${formatTime(start)} – until` : formatTime(start);
  return note ?? "Time TBD";
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!iso) return "Date TBD";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function todayIso(tz = "America/New_York"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())!;
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
