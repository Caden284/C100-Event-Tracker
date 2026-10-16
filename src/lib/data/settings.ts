import "server-only";
import type { Supabase } from "@/lib/supabase/server";

export type EngagementSettings = { high_min_events: number; medium_min_events: number; count_all_categories: boolean };
export type ImportLimits = { max_file_mb: number; max_rows: number };

const DEFAULTS = {
  prospect_engagement: { high_min_events: 3, medium_min_events: 2, count_all_categories: true } as EngagementSettings,
  import_limits: { max_file_mb: 5, max_rows: 5000 } as ImportLimits,
  at_risk: { behind_pace_margin: 0.25 },
  organization: { name: "Collegiate 100 at Georgia State University", short_name: "C100 GSU", app_name: "C100 Membership Hub" },
};
type Defaults = typeof DEFAULTS;

export async function getSetting<K extends keyof Defaults>(supabase: Supabase, key: K): Promise<Defaults[K]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  return { ...DEFAULTS[key], ...((data?.value as object) ?? {}) } as Defaults[K];
}
