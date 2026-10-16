/**
 * Normalization helpers. These MUST stay consistent with the SQL functions
 * public.norm_text / public.norm_email / public.is_valid_email.
 */

export const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s/g, "").toLowerCase();
  return s.length ? s : null;
}

export function isValidEmail(value: unknown): boolean {
  const e = normalizeEmail(value);
  return !!e && EMAIL_RE.test(e);
}

/** Lower-case, trim, collapse whitespace (exact PIN-name matching). */
export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  return s.length ? s : null;
}

/** Looser key used ONLY for suggestions ("Study & Self-Care Social" ≈ "Study & Self Care Social"). */
export function fuzzyKey(value: unknown): string {
  return (normalizeText(value) ?? "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|of|with|c100)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient on character bigrams of the fuzzy keys (0..1). */
export function similarity(a: unknown, b: unknown): number {
  const x = fuzzyKey(a).replace(/ /g, "");
  const y = fuzzyKey(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** PIN card ids are trusted only when they look like a Panther ID (digits). */
export function isReliableCardId(value: unknown): boolean {
  return /^\d{6,12}$/.test(String(value ?? "").trim());
}

export function cleanCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

export function displayName(p: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null }): string {
  const first = p.preferred_name?.trim() || p.first_name?.trim() || "";
  return `${first} ${p.last_name?.trim() ?? ""}`.trim() || "(no name)";
}

/** Splits "Last, First" or "First Last" into parts. Used only when a file has a single name column. */
export function splitFullName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const s = full.trim().replace(/\s+/g, " ");
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2).map((x) => x.trim());
    return { first: first || null, last: last || null };
  }
  const parts = s.split(" ");
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}
