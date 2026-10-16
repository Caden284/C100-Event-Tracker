"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { bool, check, isUuid, req, run, str, UserError } from "@/lib/actions";
import type { ActionState } from "@/lib/action-state";
import type { Supabase } from "@/lib/supabase/server";
import { addDays, parseFlexibleDate, parseTimeRange } from "@/lib/domain/dates";
import { parseTabularFile } from "@/lib/domain/tabular";
import { normalizeText } from "@/lib/domain/normalize";

const PLANNING = ["proposed", "confirmed", "pending_approval", "cancelled"];
const SOURCES = ["pin", "paper", "mixed", "none"];

async function semesterFor(supabase: Supabase, date: string | null, fallback: string | null): Promise<string | null> {
  if (date) {
    const { data } = await supabase.from("semesters").select("id").lte("start_date", date).gte("end_date", date).limit(1).maybeSingle();
    if (data) return data.id;
  }
  return fallback;
}

function readEvent(fd: FormData) {
  const time = (k: string) => {
    const v = str(fd, k);
    if (v && !/^\d{2}:\d{2}$/.test(v)) throw new UserError("Times must look like 18:30.");
    return v;
  };
  const date = str(fd, "event_date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("Invalid date.");
  const planning = str(fd, "planning_status") ?? "proposed";
  const source = str(fd, "attendance_source") ?? "pin";
  if (!PLANNING.includes(planning) || !SOURCES.includes(source)) throw new UserError("Invalid status.");
  const start = time("start_time");
  const end = time("end_time");
  if (start && end && end < start) throw new UserError("End time is before start time.");
  return {
    name: req(fd, "name", "Event name").slice(0, 200),
    event_date: date,
    start_time: start,
    end_time: end,
    time_note: str(fd, "time_note"),
    location: str(fd, "location"),
    category_key: str(fd, "category_key"),
    description: str(fd, "description"),
    notes: str(fd, "notes"),
    planning_status: planning,
    attendance_source: source,
  };
}

export async function saveEvent(_p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await run(async () => {
    const s = await assertPermission("events.write");
    const id = str(fd, "id");
    const values = readEvent(fd);
    const semester_id = await semesterFor(s.supabase, values.event_date, str(fd, "semester_id"));
    const pin = str(fd, "pin_name");
    const override = str(fd, "counting_override");
    const overrideReason = str(fd, "counting_override_reason");
    const extra: Record<string, unknown> = {};
    if (override !== (str(fd, "previous_override") ?? null)) {
      if (!s.can("policies.approve")) throw new UserError("Only officers who approve policies can change how an event counts.");
      if (override && !overrideReason) throw new UserError("Record the chapter decision that approved this counting exception.");
      Object.assign(extra, {
        counting_override: override,
        counting_override_reason: override ? overrideReason : null,
        counting_override_approved_by: override ? s.userId : null,
        counting_override_approved_at: override ? new Date().toISOString() : null,
      });
    }
    let eventId = id;
    if (id) {
      if (!isUuid(id)) throw new UserError("Unknown event.");
      check(await s.supabase.from("events").update({ ...values, ...extra, semester_id, change_reason: str(fd, "change_reason") ?? "Edited" }).eq("id", id));
    } else {
      const ins = check(await s.supabase.from("events").insert({ ...values, ...extra, semester_id }).select("id").single());
      eventId = ins.id;
    }
    if (pin) {
      await s.supabase.from("event_pin_names").update({ is_primary: false }).eq("event_id", eventId!).eq("is_primary", true);
      const { error } = await s.supabase.from("event_pin_names").upsert({ event_id: eventId!, pin_name: pin, is_primary: true }, { onConflict: "event_id,pin_name_normalized" });
      if (error) throw error;
    }
    revalidatePath("/events"); revalidatePath("/calendar"); revalidatePath("/");
    target = `/events/${eventId}`;
  });
  if (res?.ok) redirect(target);
  return res;
}

export async function addPinName(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("events.write");
    const eventId = req(fd, "event_id");
    const name = req(fd, "pin_name", "PIN event name");
    const { data: clash } = await s.supabase.from("event_pin_names").select("event_id, events(name, event_date)").eq("pin_name_normalized", normalizeText(name)!).neq("event_id", eventId);
    check(await s.supabase.from("event_pin_names").insert({ event_id: eventId, pin_name: name }));
    revalidatePath(`/events/${eventId}`);
    return clash?.length
      ? `Alias added. Note: ${clash.length} other event(s) use the same PIN name — imports will use the event date to decide, or ask you.`
      : "Alias added. Future PIN exports with this name will match this event.";
  });
}

export async function removePinName(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("events.write");
    check(await s.supabase.from("event_pin_names").delete().eq("id", req(fd, "id")));
    revalidatePath(`/events/${req(fd, "event_id")}`);
    return "Alias removed. Existing attendance is not affected.";
  });
}

export async function setArchived(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("events.write");
    const archive = bool(fd, "archive");
    check(await s.supabase.from("events").update({ archived_at: archive ? new Date().toISOString() : null, change_reason: str(fd, "reason") ?? (archive ? "Archived" : "Restored") }).eq("id", req(fd, "id")));
    revalidatePath("/events"); revalidatePath("/calendar"); revalidatePath("/");
    return archive ? "Event archived. Its attendance no longer counts while archived; restore it to count again." : "Event restored.";
  });
}

/** Paper sign-in sheets: mark several people at once. Existing records are never duplicated. */
export async function bulkAttendance(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.write");
    const eventId = req(fd, "event_id");
    const status = str(fd, "status_key") ?? "attended";
    const ids = fd.getAll("person_id").map(String).filter(isUuid);
    if (!ids.length) throw new UserError("Select at least one person.");
    if (ids.length > 500) throw new UserError("Too many people at once.");
    const reason = str(fd, "reason") ?? "Paper sign-in";
    const existing = check(await s.supabase.from("attendance_records").select("person_id").eq("event_id", eventId).in("person_id", ids));
    const have = new Set(existing.map((r) => r.person_id));
    const rows = ids.filter((id) => !have.has(id)).map((person_id) => ({ event_id: eventId, person_id, status_key: status, source: "manual", change_reason: reason }));
    if (rows.length) check(await s.supabase.from("attendance_records").insert(rows));
    revalidatePath(`/events/${eventId}`); revalidatePath("/");
    return `${rows.length} recorded${have.size ? ` · ${have.size} already had a record (unchanged)` : ""}.`;
  });
}

/** Someone attended but is on no list: create a prospective member and record attendance. */
export async function addWalkIn(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.write");
    if (!s.can("prospects.write") && !s.can("unmatched.resolve")) throw new UserError("You need permission to create prospective members.");
    const eventId = req(fd, "event_id");
    const first = str(fd, "first_name");
    const last = str(fd, "last_name");
    const email = str(fd, "email")?.toLowerCase() ?? null;
    if (!first && !last) throw new UserError("Enter a name.");
    if (email) {
      const { data: owner } = await s.supabase.from("person_identifiers").select("person_id").eq("kind", "email").eq("value_normalized", email.replace(/\s/g, "")).maybeSingle();
      if (owner) throw new UserError("That email already belongs to someone — find them in the list above instead.");
    }
    const person = check(await s.supabase.from("people").insert({ first_name: first, last_name: last, change_reason: "Walk-in on paper sign-in" }).select("id").single());
    if (email) check(await s.supabase.from("person_identifiers").insert({ person_id: person.id, kind: "email", value: email, is_primary: true, source: "manual" }));
    check(await s.supabase.from("prospective_members").insert({ person_id: person.id, first_seen_event_id: eventId, notes: "Added from a paper sign-in" }));
    check(await s.supabase.rpc("set_manual_attendance", { p_event: eventId, p_person: person.id, p_status: "attended", p_reason: "Paper sign-in (walk-in)" }));
    revalidatePath(`/events/${eventId}`);
    return `${first ?? ""} ${last ?? ""} added as a prospective member and marked attended.${email ? "" : " No email: add one later so PIN scans merge."}`;
  });
}

export async function correctAttendance(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("attendance.write");
    const eventId = req(fd, "event_id");
    const reason = req(fd, "reason", "Reason");
    if (str(fd, "op") === "delete") {
      check(await s.supabase.rpc("delete_attendance_record", { p_id: req(fd, "id"), p_reason: reason }));
    } else {
      check(await s.supabase.rpc("set_manual_attendance", { p_event: eventId, p_person: req(fd, "person_id"), p_status: req(fd, "status_key"), p_reason: reason }));
    }
    revalidatePath(`/events/${eventId}`); revalidatePath("/");
    return "Attendance corrected. Totals recalculate automatically.";
  });
}

export async function createSeries(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("events.write");
    const name = req(fd, "name", "Name");
    const from = req(fd, "from", "Start date");
    const to = req(fd, "to", "End date");
    const weekdays = fd.getAll("weekday").map(Number).filter((n) => n >= 0 && n <= 6);
    const skip = new Set((str(fd, "skip") ?? "").split(/[\s,]+/).map(parseFlexibleDate).filter(Boolean));
    if (!weekdays.length) throw new UserError("Pick at least one weekday.");
    if (to < from) throw new UserError("End date is before start date.");
    const dates: string[] = [];
    for (let d = from; d <= to && dates.length < 120; d = addDays(d, 1)) {
      if (weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !skip.has(d)) dates.push(d);
    }
    if (!dates.length) throw new UserError("No dates match those weekdays.");
    const seriesKey = `${normalizeText(name)!.replace(/[^a-z0-9]+/g, "-")}-${from}`;
    const base = readEvent(fd);
    const rows = [];
    for (const d of dates) {
      rows.push({ ...base, name, event_date: d, series_key: seriesKey, semester_id: await semesterFor(s.supabase, d, null) });
    }
    check(await s.supabase.from("events").insert(rows));
    revalidatePath("/events"); revalidatePath("/calendar");
    return `Created ${rows.length} events in the “${name}” series.`;
  });
}

/** Bulk-create events from a CSV/XLSX calendar. Rows already present (same name + date) are skipped. */
export async function importEvents(_p: ActionState, fd: FormData) {
  return run(async () => {
    const s = await assertPermission("events.write");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a CSV or Excel file.");
    const table = await parseTabularFile(new Uint8Array(await file.arrayBuffer()), { maxBytes: 2 * 1024 * 1024, maxRows: 1000 });
    const head = table.rows[0].map((h) => normalizeText(h) ?? "");
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const ci = { date: col("date", "event date"), name: col("name", "event", "event name"), time: col("time"), start: col("start", "start time"), end: col("end", "end time"),
      location: col("location", "room", "location / room"), category: col("category"), status: col("status", "planning status"), notes: col("notes"), pin: col("pin event name", "pin name") };
    if (ci.name < 0) throw new UserError('The file needs a "name" column (and usually "date", "category").');
    const { data: cats } = await s.supabase.from("event_categories").select("key, name");
    const catKey = (v: string) => (cats ?? []).find((c) => c.key === normalizeText(v) || normalizeText(c.name) === normalizeText(v))?.key ?? null;
    let created = 0, skipped = 0;
    const problems: string[] = [];
    for (let i = 1; i < table.rows.length; i++) {
      const r = table.rows[i];
      const name = r[ci.name]?.trim();
      if (!name) continue;
      const date = ci.date >= 0 ? parseFlexibleDate(r[ci.date]) : null;
      if (ci.date >= 0 && r[ci.date] && !date) { problems.push(`Row ${i + 1}: unreadable date "${r[ci.date]}"`); continue; }
      const t = ci.time >= 0 ? parseTimeRange(r[ci.time]) : { start: ci.start >= 0 ? r[ci.start] || null : null, end: ci.end >= 0 ? r[ci.end] || null : null, note: null };
      let q = s.supabase.from("events").select("id").eq("name", name);
      q = date ? q.eq("event_date", date) : q.is("event_date", null);
      const { data: dup } = await q.limit(1);
      if (dup?.length) { skipped++; continue; }
      const status = normalizeText(r[ci.status] ?? "")?.replace(/\s+/g, "_") ?? "proposed";
      const ev = check(await s.supabase.from("events").insert({
        name, event_date: date, start_time: t.start, end_time: t.end, time_note: t.note,
        location: ci.location >= 0 ? r[ci.location] || null : null,
        category_key: ci.category >= 0 ? catKey(r[ci.category]) : null,
        planning_status: PLANNING.includes(status) ? status : "proposed",
        notes: ci.notes >= 0 ? r[ci.notes] || null : null,
        series_key: normalizeText(name)!.replace(/[^a-z0-9]+/g, "-"),
        semester_id: await semesterFor(s.supabase, date, null),
        attendance_source: catKey(r[ci.category] ?? "") === "study" ? "none" : "pin",
      }).select("id").single());
      if (ci.pin >= 0 && r[ci.pin]) await s.supabase.from("event_pin_names").insert({ event_id: ev.id, pin_name: r[ci.pin], is_primary: true });
      created++;
    }
    revalidatePath("/events"); revalidatePath("/calendar");
    return `${created} event(s) created, ${skipped} already existed (skipped).${problems.length ? ` Problems: ${problems.slice(0, 5).join("; ")}` : ""}`;
  });
}
