"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { friendlyError, isUuid } from "@/lib/actions";
import { formatDate } from "@/lib/domain/dates";

export type MoveResult = { ok: boolean; error?: string; warning?: string };

/** Reschedules an event (drag-and-drop on the calendar). Audited with the old and new date. */
export async function moveEvent(eventId: string, newDate: string | null): Promise<MoveResult> {
  try {
    const s = await assertPermission("events.write");
    if (!isUuid(eventId)) return { ok: false, error: "Unknown event." };
    if (newDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { ok: false, error: "Invalid date." };
    const { data: ev, error: e1 } = await s.supabase
      .from("events").select("id, name, event_date, semester_id, semesters(name, start_date, end_date)").eq("id", eventId).single();
    if (e1) throw e1;
    if (ev.event_date === newDate) return { ok: true };
    const { error } = await s.supabase.from("events").update({
      event_date: newDate,
      change_reason: `Rescheduled on the calendar: ${formatDate(ev.event_date)} → ${formatDate(newDate)}`,
    }).eq("id", eventId);
    if (error) throw error;
    const warnings: string[] = [];
    const sem = ev.semesters as { name: string; start_date: string; end_date: string } | null;
    if (newDate && sem && (newDate < sem.start_date || newDate > sem.end_date)) warnings.push(`The new date is outside ${sem.name}.`);
    const { count } = await s.supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    if (count) warnings.push(`This event already has ${count} attendance record(s); they stay attached to the event.`);
    revalidatePath("/calendar"); revalidatePath("/events"); revalidatePath("/");
    return { ok: true, warning: warnings.join(" ") || undefined };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}
