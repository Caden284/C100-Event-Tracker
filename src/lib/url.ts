export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

/** Builds `${path}?…` keeping current params and applying changes (null removes). */
export function hrefWith(path: string, params: SearchParams, changes: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) u.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === "") u.delete(k);
    else u.set(k, String(v));
  }
  const q = u.toString();
  return q ? `${path}?${q}` : path;
}

export function pageOf(params: SearchParams): number {
  const n = Number(sp(params, "page") ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
