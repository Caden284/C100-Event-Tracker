import "server-only";
import { cookies } from "next/headers";
import type { Supabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Semester = Database["public"]["Tables"]["semesters"]["Row"];
export const SEMESTER_COOKIE = "c100_semester";

export async function listSemesters(supabase: Supabase): Promise<Semester[]> {
  const { data, error } = await supabase.from("semesters").select("*").order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * The semester currently being viewed: an explicit ?semester= id, else the
 * officer's last choice (cookie), else the active semester, else the most recent.
 */
export async function resolveSemester(supabase: Supabase, explicit?: string | null): Promise<{ current: Semester | null; all: Semester[] }> {
  const all = await listSemesters(supabase);
  const jar = await cookies();
  const wanted = explicit || jar.get(SEMESTER_COOKIE)?.value;
  const current =
    all.find((s) => s.id === wanted) ?? all.find((s) => s.status === "active") ?? all.find((s) => s.status === "upcoming") ?? all[0] ?? null;
  return { current, all };
}

export function semesterLabel(s: Semester | null): string {
  if (!s) return "No semester";
  return `${s.name} · ${s.academic_year.replace("-", "–")}`;
}
