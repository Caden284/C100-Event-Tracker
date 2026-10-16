import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase returns at most 1,000 rows per request. This pages through a query
 * until everything is loaded. `make(from, to)` must build a fresh query using
 * `.range(from, to)` and a stable `.order(...)`.
 */
export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await make(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
