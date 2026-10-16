import "server-only";
import type { SessionContext } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";

export type EventCounts = { attended: number; members: number; prospects: number; records: number };

export async function attendanceCountsByEvent(s: SessionContext, eventIds: string[]): Promise<Map<string, EventCounts>> {
  const out = new Map<string, EventCounts>();
  if (!eventIds.length || !s.can("attendance.read")) return out;
  for (let i = 0; i < eventIds.length; i += 150) {
    const chunk = eventIds.slice(i, i + 150);
    const rows = await fetchAll((from, to) =>
      s.supabase.from("v_attendance_detail").select("event_id, counts_as_attended, member_id, prospect_id").in("event_id", chunk).order("id").range(from, to));
    for (const r of rows) {
      const c = out.get(r.event_id!) ?? { attended: 0, members: 0, prospects: 0, records: 0 };
      c.records += 1;
      if (r.counts_as_attended) {
        c.attended += 1;
        if (r.member_id) c.members += 1;
        else if (r.prospect_id) c.prospects += 1;
      }
      out.set(r.event_id!, c);
    }
  }
  return out;
}

export function rosterStatus(e: { event_date: string | null; planning_status: string; archived_at?: string | null }, records: number, today: string) {
  if (e.archived_at) return { label: "Archived", tone: "neutral" as const };
  if (e.planning_status === "cancelled") return { label: "Cancelled", tone: "neutral" as const };
  if (!e.event_date) return { label: "Date TBD", tone: "neutral" as const };
  if (records > 0) return { label: "Logged", tone: "green" as const };
  if (e.event_date < today) return { label: "Needs roster", tone: "amber" as const };
  return { label: "Upcoming", tone: "blue" as const };
}
