import "server-only";
import ExcelJS from "exceljs";
import type { Permission, SessionContext } from "@/lib/auth";
import type { Semester } from "@/lib/data/semesters";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadStanding } from "@/lib/data/roster";
import { loadProspects } from "@/lib/data/prospects";
import { candidatesFor } from "@/lib/data/recognition";
import { attendanceCountsByEvent } from "@/lib/data/events";
import { STANDING_LABELS } from "@/lib/domain/progress";
import { displayName } from "@/lib/domain/normalize";
import { toCsv, safeCell } from "@/lib/domain/csv";
import { activeStrikeCount, strikeEligibility } from "@/lib/domain/standing";

type Row = Record<string, unknown>;
export type ReportColumn = { key: string; label: string; default?: boolean; sensitive?: boolean };
export type ReportDef = {
  key: string; title: string; description: string; group: string;
  anyOf: Permission[]; requiresSensitive?: boolean;
  columns: ReportColumn[];
  load: (s: SessionContext, sem: Semester, all: Semester[]) => Promise<Row[]>;
};

const c = (key: string, label: string, opts: Partial<ReportColumn> = {}): ReportColumn => ({ key, label, default: true, ...opts });

async function memberRows(s: SessionContext, sem: Semester) {
  const { members, policy } = await loadStanding(s, sem);
  return { members, policy };
}

export const REPORTS: ReportDef[] = [
  {
    key: "roster", title: "Membership roster", group: "Members", description: "Everyone on the member roster with official status.", anyOf: ["members.read"],
    columns: [c("first_name", "First name"), c("last_name", "Last name"), c("email", "Email"), c("status", "Status"), c("eboard_role", "E-Board role"), c("committee", "Committee"), c("member_since", "Member since", { default: false }), c("notes", "Private notes", { default: false, sensitive: true })],
    load: async (s, sem) => {
      const { members } = await memberRows(s, sem);
      const notes = new Map<string, string>();
      if (s.can("members.notes")) for (const n of await fetchAll((f, t) => s.supabase.from("member_notes").select("member_id, body").order("created_at").range(f, t))) notes.set(n.member_id, [notes.get(n.member_id), n.body].filter(Boolean).join(" | "));
      return members.map((m) => ({ first_name: m.first_name, last_name: m.last_name, email: m.email, status: m.status_key, eboard_role: m.eboard_role, committee: m.committee, member_since: m.member_since, notes: notes.get(m.member_id) }));
    },
  },
  {
    key: "attendance-by-member", title: "Attendance by member", group: "Attendance", description: "Counts per requirement, total and calculated standing (semester).", anyOf: ["standing.read"],
    columns: [c("name", "Member"), c("email", "Email"), c("status", "Status"), c("meetings", "Meetings"), c("general", "General"), c("service", "Service"), c("mentoring", "Mentoring"), c("total", "Total counted"), c("percent", "% of requirements"), c("standing", "Calculated standing"), c("standout", "Standout"), c("policy", "Policy status"), c("warnings", "System warnings", { default: false })],
    load: async (s, sem) => {
      const { members, policy } = await memberRows(s, sem);
      return members.map((m) => ({
        name: m.name, email: m.email, status: m.status_key, ...Object.fromEntries(m.progress.requirements.map((r) => [r.key, r.attended])),
        total: m.progress.totalCounted, percent: m.progress.percentComplete, standing: STANDING_LABELS[m.progress.standing], standout: m.progress.isStandout ? "Yes" : "",
        policy: policy?.status ?? "none", warnings: m.progress.warnings.join(" | "),
      }));
    },
  },
  {
    key: "missing-email", title: "Missing-email report", group: "Members", description: "Members who cannot be matched to PIN scans.", anyOf: ["members.read"],
    columns: [c("first_name", "First name"), c("last_name", "Last name"), c("status", "Status"), c("eboard_role", "E-Board role")],
    load: async (s, sem) => (await memberRows(s, sem)).members.filter((m) => !m.email).map((m) => ({ first_name: m.first_name, last_name: m.last_name, status: m.status_key, eboard_role: m.eboard_role })),
  },
  {
    key: "attention", title: "Members needing attention", group: "Standing", description: "Behind pace or unable to meet a requirement with remaining events (system warnings).", anyOf: ["standing.read"],
    columns: [c("name", "Member"), c("email", "Email"), c("percent", "% complete"), c("warnings", "Warnings"), c("strikes", "Strikes (eligibility)", { default: false, sensitive: true })],
    load: async (s, sem) => {
      const { members } = await memberRows(s, sem);
      const { rules, policy } = await loadStanding(s, sem);
      const strikes = s.can("discipline.read") ? (await s.supabase.from("strike_records").select("member_id, points, voided_at, semester_id")).data ?? [] : [];
      return members.filter((m) => m.progress.needsAttention).map((m) => ({
        name: m.name, email: m.email, percent: m.progress.percentComplete, warnings: m.progress.warnings.join(" | ") || "No email",
        strikes: strikeEligibility(activeStrikeCount(strikes.filter((x) => x.member_id === m.member_id), sem.id), rules, policy?.status ?? null).description,
      }));
    },
  },
  {
    key: "attendance-by-event", title: "Attendance by event", group: "Attendance", description: "Each event with members, prospects and total attended.", anyOf: ["events.read"],
    columns: [c("date", "Date"), c("event", "Event"), c("category", "Category"), c("location", "Location"), c("members", "Members"), c("prospects", "Prospects"), c("attended", "Total attended"), c("pin", "PIN names", { default: false })],
    load: async (s, sem) => {
      const { data } = await s.supabase.from("events").select("id, name, event_date, category_key, location, event_pin_names(pin_name)").eq("semester_id", sem.id).is("archived_at", null).order("event_date");
      const counts = await attendanceCountsByEvent(s, (data ?? []).map((e) => e.id));
      return (data ?? []).map((e) => ({ date: e.event_date, event: e.name, category: e.category_key, location: e.location, members: counts.get(e.id)?.members ?? 0, prospects: counts.get(e.id)?.prospects ?? 0, attended: counts.get(e.id)?.attended ?? 0, pin: (e.event_pin_names as { pin_name: string }[]).map((p) => p.pin_name).join("; ") }));
    },
  },
  {
    key: "attendance-by-category", title: "Attendance by category", group: "Attendance", description: "Totals per event category.", anyOf: ["attendance.read"],
    columns: [c("category", "Category"), c("events", "Events with attendance"), c("attended", "Attended"), c("members", "Members"), c("prospects", "Prospects")],
    load: async (s, sem) => {
      const rows = await fetchAll((f, t) => s.supabase.from("v_attendance_detail").select("event_id, category_key, counts_as_attended, member_id, prospect_id").eq("semester_id", sem.id).order("id").range(f, t));
      const m = new Map<string, { events: Set<string>; attended: number; members: number; prospects: number }>();
      for (const r of rows) {
        if (!r.counts_as_attended) continue;
        const k = r.category_key ?? "uncategorized";
        const x = m.get(k) ?? { events: new Set(), attended: 0, members: 0, prospects: 0 };
        x.events.add(r.event_id!); x.attended++; if (r.member_id) x.members++; else if (r.prospect_id) x.prospects++;
        m.set(k, x);
      }
      return [...m.entries()].map(([k, x]) => ({ category: k, events: x.events.size, attended: x.attended, members: x.members, prospects: x.prospects }));
    },
  },
  {
    key: "attendance-detail", title: "Attendance records (detail)", group: "Attendance", description: "Every attendance record with its source.", anyOf: ["attendance.read"],
    columns: [c("date", "Event date"), c("event", "Event"), c("category", "Category"), c("first_name", "First name"), c("last_name", "Last name"), c("type", "Person type"), c("status", "Status"), c("source", "Source")],
    load: async (s, sem) => (await fetchAll((f, t) => s.supabase.from("v_attendance_detail").select("event_date, event_name, category_key, first_name, last_name, member_id, prospect_id, status_key, source").eq("semester_id", sem.id).order("event_date").order("id").range(f, t)))
      .map((r) => ({ date: r.event_date, event: r.event_name, category: r.category_key, first_name: r.first_name, last_name: r.last_name, type: r.member_id ? "member" : r.prospect_id ? "prospect" : "", status: r.status_key, source: r.source })),
  },
  {
    key: "prospects", title: "Prospective-member engagement", group: "Recruitment", description: "Events attended, interest indicator, follow-up and conversion.", anyOf: ["prospects.read"],
    columns: [c("name", "Name"), c("email", "Email"), c("events", "Events attended"), c("recruitment", "Recruitment events"), c("interest", "Interest indicator"), c("first_seen", "First seen"), c("last_seen", "Last seen"), c("follow_up", "Follow-up"), c("status", "Status"), c("notes", "Notes", { default: false, sensitive: true })],
    load: async (s) => (await loadProspects(s)).map((p) => ({ name: p.name, email: p.email, events: p.engagement.eventsAttended, recruitment: p.recruitmentEvents, interest: p.interest, first_seen: p.first_seen_text ?? p.engagement.firstSeen, last_seen: p.engagement.lastSeen, follow_up: p.follow_up_status, status: p.status, notes: p.notes })),
  },
  {
    key: "recognition", title: "Recognition candidates & recipients", group: "Recognition", description: "Calculated eligibility per award plus official recipients.", anyOf: ["recognition.read"],
    columns: [c("award", "Award"), c("name", "Candidate"), c("eligible", "Eligible (calculated)"), c("basis", "Basis"), c("official", "Official recipient")],
    load: async (s, sem, all) => {
      const { data: cats } = await s.supabase.from("recognition_categories").select("*").eq("is_active", true);
      const { data: results } = await s.supabase.from("recognition_results").select("person_id, is_official, recognition_periods!inner(semester_id, category_id)").eq("is_official", true);
      const out: Row[] = [];
      for (const cat of cats ?? []) {
        const official = new Set((results ?? []).filter((r) => (r.recognition_periods as unknown as { semester_id: string; category_id: string }).category_id === cat.id && (r.recognition_periods as unknown as { semester_id: string }).semester_id === sem.id).map((r) => r.person_id));
        for (const x of (await candidatesFor(s, cat, sem, all)).filter((x) => x.eligible || official.has(x.person_id)).slice(0, 50)) out.push({ award: cat.name, name: x.name, eligible: x.eligible ? "Yes" : "No", basis: x.detail, official: official.has(x.person_id) ? "Yes" : "" });
      }
      return out;
    },
  },
  {
    key: "leaderboard", title: "Participation leaderboard", group: "Recognition", description: "Members ranked by counted events (no standing or disciplinary data).", anyOf: ["points.read", "recognition.read"],
    columns: [c("rank", "Rank"), c("name", "Member"), c("counted", "Counted events")],
    load: async (s, sem) => {
      const { members } = await memberRows(s, sem);
      return [...members].filter((m) => m.status_key === "active").sort((a, b) => b.progress.totalCounted - a.progress.totalCounted).map((m, i, arr) => ({ rank: arr.findIndex((x) => x.progress.totalCounted === m.progress.totalCounted) + 1, name: m.name, counted: m.progress.totalCounted }));
    },
  },
  {
    key: "discipline", title: "Warnings & probation records", group: "Standing", description: "Formal disciplinary actions (authorized users only).", anyOf: ["discipline.read"], requiresSensitive: true,
    columns: [c("member", "Member"), c("action", "Action"), c("status", "Status"), c("reason", "Reason", { sensitive: true }), c("effective", "Effective"), c("review", "Review date"), c("override", "Override"), c("resolution", "Resolution", { sensitive: true })],
    load: async (s) => ((await s.supabase.from("disciplinary_actions").select("*, members(people(first_name, last_name, preferred_name))").order("created_at")).data ?? []).map((a) => ({
      member: displayName((a.members as { people: never }).people), action: a.action_type, status: a.status, reason: a.reason, effective: a.effective_date, review: a.review_date, override: a.is_override ? a.override_reason : "", resolution: a.resolution,
    })),
  },
  {
    key: "dues", title: "Dues summary", group: "Members", description: "Dues status per member for the semester.", anyOf: ["dues.read"],
    columns: [c("name", "Member"), c("email", "Email"), c("status", "Member status"), c("dues", "Dues"), c("amount", "Amount", { default: false, sensitive: true }), c("paid_on", "Paid on", { default: false }), c("note", "Note", { default: false, sensitive: true })],
    load: async (s, sem) => {
      const { members } = await memberRows(s, sem);
      const { data } = await s.supabase.from("member_dues").select("member_id, status, amount_cents, paid_on, note").eq("semester_id", sem.id);
      const by = new Map((data ?? []).map((d) => [d.member_id, d]));
      return members.map((m) => { const d = by.get(m.member_id); return { name: m.name, email: m.email, status: m.status_key, dues: d?.status ?? "not recorded", amount: d?.amount_cents != null ? (d.amount_cents / 100).toFixed(2) : "", paid_on: d?.paid_on, note: d?.note }; });
    },
  },
  {
    key: "unmatched", title: "Unmatched scans", group: "Attendance", description: "Review queue, open and resolved.", anyOf: ["attendance.read"],
    columns: [c("first_name", "First name"), c("last_name", "Last name"), c("email", "Email"), c("event", "Event"), c("date", "Date"), c("reason", "Reason"), c("status", "Resolution"), c("note", "Note")],
    load: async (s) => ((await s.supabase.from("unmatched_scans").select("first_name, last_name, email, pin_event_name, event_date, reason, resolution_status, resolution_note, events(name)").order("created_at")).data ?? [])
      .map((u) => ({ first_name: u.first_name, last_name: u.last_name, email: u.email, event: (u.events as { name: string } | null)?.name ?? u.pin_event_name, date: u.event_date, reason: u.reason, status: u.resolution_status, note: u.resolution_note })),
  },
  {
    key: "imports", title: "Import history & errors", group: "Attendance", description: "Every PIN upload with its results.", anyOf: ["attendance.read"],
    columns: [c("uploaded", "Uploaded"), c("file", "File"), c("status", "Status"), c("rows", "Rows"), c("inserted", "Recorded"), c("duplicates", "Duplicates"), c("review", "Sent to review"), c("invalid", "Invalid")],
    load: async (s) => ((await s.supabase.from("attendance_imports").select("created_at, file_name, status, row_count, summary").order("created_at")).data ?? []).map((i) => {
      const m = i.summary as Record<string, number>;
      return { uploaded: i.created_at, file: i.file_name, status: i.status, rows: i.row_count, inserted: m.inserted ?? 0, duplicates: m.duplicates_skipped ?? m.duplicate ?? 0, review: m.queued_for_review ?? 0, invalid: m.invalid ?? 0 };
    }),
  },
  {
    key: "semester-comparison", title: "Semester summary & comparison", group: "Overview", description: "Key figures for every semester side by side.", anyOf: ["attendance.read"],
    columns: [c("semester", "Semester"), c("status", "Status"), c("events", "Events held"), c("attended", "Counted check-ins"), c("avg", "Average per event"), c("people", "Distinct attendees")],
    load: async (s, _sem, all) => {
      const rows = await fetchAll((f, t) => s.supabase.from("v_attendance_detail").select("semester_id, event_id, person_id, counts_as_attended").order("id").range(f, t));
      return all.map((x) => {
        const r = rows.filter((y) => y.semester_id === x.id && y.counts_as_attended);
        const ev = new Set(r.map((y) => y.event_id)).size;
        return { semester: x.name, status: x.status, events: ev, attended: r.length, avg: ev ? (r.length / ev).toFixed(1) : "0", people: new Set(r.map((y) => y.person_id)).size };
      });
    },
  },
  {
    key: "eboard-summary", title: "Executive board meeting summary", group: "Overview", description: "One-page snapshot of the semester for an e-board meeting.", anyOf: ["standing.read"],
    columns: [c("metric", "Metric"), c("value", "Value"), c("note", "Note")],
    load: async (s, sem) => {
      const { members, policy, facts, events, today } = await loadStanding(s, sem);
      const counts = (await s.supabase.rpc("open_review_counts")).data as Record<string, number> | null;
      const tracked = members.filter((m) => m.progress.standing !== "not_tracked");
      return [
        { metric: "Semester", value: sem.name, note: `Policy: ${policy ? `${policy.name} v${policy.version} (${policy.status})` : "none"}` },
        { metric: "Active members", value: members.filter((m) => m.status_key === "active").length, note: "Official status" },
        { metric: "Meeting all requirements", value: tracked.filter((m) => m.progress.standing === "good_standing").length, note: "Calculated" },
        { metric: "Needing attention", value: tracked.filter((m) => m.progress.needsAttention).length, note: "System warning — not a disciplinary finding" },
        { metric: "Missing email", value: members.filter((m) => !m.email).length, note: "Data quality" },
        { metric: "Events held", value: events.filter((e) => e.event_date && e.event_date < today).length, note: "" },
        { metric: "Counted check-ins", value: facts.filter((f) => f.counts_as_attended).length, note: "" },
        { metric: "Upcoming events", value: events.filter((e) => e.event_date && e.event_date >= today).length, note: "" },
        { metric: "Unmatched scans open", value: counts?.unmatched_open ?? 0, note: "" },
      ];
    },
  },
];

export function reportAllowed(s: SessionContext, r: ReportDef) {
  return s.can("reports.export") && r.anyOf.some((p) => s.can(p)) && (!r.requiresSensitive || s.can("reports.sensitive"));
}

export async function renderReport(rows: Row[], cols: ReportColumn[], format: "csv" | "xlsx", title: string): Promise<{ body: BodyInit; type: string; ext: string }> {
  if (format === "csv") return { body: toCsv(rows, cols.map((col) => ({ key: col.key, label: col.label, value: (r: Row) => r[col.key] }))), type: "text/csv; charset=utf-8", ext: "csv" };
  const wb = new ExcelJS.Workbook();
  wb.creator = "C100 Membership Hub";
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.columns = cols.map((col) => ({ header: col.label, key: col.key, width: Math.min(50, Math.max(12, col.label.length + 4)) }));
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map((col) => [col.key, typeof r[col.key] === "string" ? safeCell(r[col.key]) : r[col.key] ?? ""])));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return { body: new Uint8Array(buf as ArrayBuffer), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
}
