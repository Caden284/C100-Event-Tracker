import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { FIELD_LABELS, IMPORT_FIELDS, mappingProblems, type ColumnMapping } from "@/lib/domain/columns";
import { formatDate } from "@/lib/domain/dates";
import { normalizeText, similarity } from "@/lib/domain/normalize";
import { FILE_GROUP } from "@/lib/domain/import-rows";
import { Callout, PageHeader, StatCard } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LinkButton } from "@/components/ui/button";
import { hrefWith, sp } from "@/lib/url";
import { cancelImport, commitImport, saveEventResolution, saveMapping } from "../actions";

export const metadata = { title: "Review import" };

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "green" }, duplicate: { label: "Duplicate — skipped", tone: "neutral" }, conflict: { label: "Conflict", tone: "red" },
  unmatched: { label: "Unmatched person", tone: "amber" }, unmapped_event: { label: "Unmapped event", tone: "amber" }, invalid: { label: "Invalid", tone: "red" },
  deferred: { label: "Deferred", tone: "amber" }, replaced: { label: "Replaced existing", tone: "blue" }, kept_existing: { label: "Kept existing", tone: "neutral" },
  created_prospect: { label: "New prospect", tone: "gold" },
};

export default async function ImportReview({ params, searchParams }: PageProps<"/attendance/import/[id]">) {
  const { id } = await params;
  const q = await searchParams;
  const s = await requirePermission("attendance.read");
  const { data: imp } = await s.supabase.from("attendance_imports").select("*").eq("id", id).maybeSingle();
  if (!imp) notFound();
  const rows = await fetchAll((from, to) => s.supabase.from("attendance_import_rows")
    .select("id, row_number, raw, first_name, last_name, email, card_id, pin_event_name, event_date, event_date_raw, status_raw, status_key, group_key, event_id, person_id, person_type, match_method, outcome, message")
    .eq("import_id", id).order("row_number").range(from, to));
  const mapping = imp.column_mapping as ColumnMapping;
  const sum = imp.summary as Record<string, number>;
  const editable = imp.status === "preview" && s.can("attendance.import");
  const filter = sp(q, "outcome");

  const [{ data: statuses }, { data: dupFiles }, { data: semEvents }] = await Promise.all([
    s.supabase.from("attendance_statuses").select("key, name, is_active").order("sort_order"),
    s.supabase.from("attendance_imports").select("id, created_at, file_name").eq("file_sha256", imp.file_sha256).eq("status", "committed").neq("id", id),
    s.supabase.from("events").select("id, name, event_date, category_key, event_pin_names(pin_name)").is("archived_at", null).order("event_date", { ascending: false }).limit(400),
  ]);
  const { data: cats } = await s.supabase.from("event_categories").select("key, name").eq("is_active", true).order("sort_order");

  // ----- event groups with suggestions (suggestions are never applied automatically)
  const resolution = imp.event_resolution as Record<string, { action: string; event_id?: string; remember?: boolean }>;
  const groupMap = new Map<string, { key: string; name: string | null; date: string | null; rows: number; resolvedEvent: string | null; outcomeUnmapped: number }>();
  for (const r of rows) {
    const g = groupMap.get(r.group_key ?? "") ?? { key: r.group_key ?? "", name: r.pin_event_name, date: r.event_date, rows: 0, resolvedEvent: null, outcomeUnmapped: 0 };
    g.rows++;
    if (r.event_id) g.resolvedEvent = r.event_id;
    if (r.outcome === "unmapped_event") g.outcomeUnmapped++;
    groupMap.set(g.key, g);
  }
  const groups = [...groupMap.values()];
  const evById = new Map((semEvents ?? []).map((e) => [e.id, e]));
  const suggestFor = (name: string | null, date: string | null) =>
    (semEvents ?? []).map((e) => {
      const pins = (e.event_pin_names as { pin_name: string }[]).map((p) => p.pin_name);
      const nameScore = Math.max(similarity(name ?? imp.file_name.replace(/\.(csv|xlsx)$/i, ""), e.name), ...pins.map((p) => similarity(name, p)));
      const dateScore = date && e.event_date === date ? 0.5 : 0;
      return { e, score: nameScore + dateScore };
    }).filter((x) => x.score > 0.45).sort((a, b) => b.score - a.score).slice(0, 4);

  const problems = mappingProblems(mapping);
  const shown = rows.filter((r) => !filter || r.outcome === filter).slice(0, 500);
  const conflicts = rows.filter((r) => r.outcome === "conflict");
  const done = imp.status === "committed";

  return (
    <>
      <PageHeader
        title={done ? "Import results" : "Review PIN import"}
        back={{ href: "/attendance", label: "Attendance" }}
        description={`${imp.file_name} · ${imp.row_count} rows · uploaded ${new Date(imp.created_at).toLocaleString("en-US")}`}
        badge={<Badge tone={done ? "green" : imp.status === "cancelled" ? "neutral" : "amber"}>{imp.status}</Badge>}
        actions={<LinkButton href={`/attendance/import/${id}/report`}><Download className="h-4 w-4" /> Download CSV report</LinkButton>}
      />
      {dupFiles?.length ? (
        <Callout tone="warning" className="mb-4" title="This exact file was already imported">
          {dupFiles.map((d) => `${d.file_name} on ${new Date(d.created_at).toLocaleDateString("en-US")}`).join("; ")}. Re-importing is safe: every row will show as a duplicate and totals will not change.
        </Callout>
      ) : null}
      {done && q.done ? <Callout tone="info" className="mb-4" title="Import committed"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Attendance totals, standing and dashboards have been recalculated.</span></Callout> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Rows in file" value={sum.total ?? imp.row_count} />
        <StatCard label={done ? "Recorded" : "New records"} value={done ? sum.inserted ?? 0 : sum.new ?? 0} tone="good" href={hrefWith(`/attendance/import/${id}`, q, { outcome: done ? null : "new" })} />
        <StatCard label="Duplicates" value={done ? sum.duplicates_skipped ?? 0 : sum.duplicate ?? 0} href={hrefWith(`/attendance/import/${id}`, q, { outcome: "duplicate" })} />
        <StatCard label="Members" value={sum.members ?? 0} />
        <StatCard label="Prospects" value={sum.prospects ?? 0} />
        <StatCard label="Unmatched people" value={sum.unmatched ?? 0} tone={sum.unmatched ? "warn" : "default"} href={hrefWith(`/attendance/import/${id}`, q, { outcome: "unmatched" })} />
        <StatCard label="Unmapped events" value={(sum.unmapped_event ?? 0) + (sum.deferred ?? 0)} tone={sum.unmapped_event ? "warn" : "default"} href={hrefWith(`/attendance/import/${id}`, q, { outcome: "unmapped_event" })} />
        <StatCard label="Conflicts · invalid" value={`${sum.conflict ?? 0} · ${sum.invalid ?? 0}`} tone={sum.conflict || sum.invalid ? "danger" : "default"} href={hrefWith(`/attendance/import/${id}`, q, { outcome: sum.conflict ? "conflict" : "invalid" })} />
      </div>
      {done ? (
        <Card className="mb-5"><CardBody className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>Queued for review: <strong>{sum.queued_for_review ?? 0}</strong></span>
          <span>Prospects created: <strong>{sum.prospects_created ?? 0}</strong></span>
          <span>Replaced: <strong>{sum.replaced ?? 0}</strong> · kept existing: <strong>{sum.kept_existing ?? 0}</strong></span>
          <span>Marked absent (roster reconciliation): <strong>{sum.marked_absent ?? 0}</strong></span>
          <span>PIN names remembered: <strong>{sum.pin_names_remembered ?? 0}</strong></span>
          {sum.queued_for_review ? <Link href="/attendance/unmatched" className="text-brand underline">Resolve unmatched scans →</Link> : null}
        </CardBody></Card>
      ) : null}

      {editable ? (
        <>
          <Card className="mb-5">
            <CardHeader title="Step 2 · Columns" description="Detected automatically from the header row. Correct anything that looks wrong." />
            <CardBody>
              <ActionForm action={saveMapping} className="space-y-4">
                <input type="hidden" name="import_id" value={id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {IMPORT_FIELDS.map((f) => (
                    <div key={f}>
                      <label htmlFor={`map_${f}`} className="block text-xs font-medium text-slate-700">{FIELD_LABELS[f]}</label>
                      <Select id={`map_${f}`} name={`map_${f}`} defaultValue={mapping[f] ?? ""} className="mt-1 h-8 text-xs">
                        <option value="">— not in file —</option>
                        {imp.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="default_status_key" className="block text-xs font-medium text-slate-700">If there is no status column, every row is…</label>
                    <Select id="default_status_key" name="default_status_key" defaultValue={imp.default_status_key ?? "attended"} className="mt-1 h-8 w-48 text-xs">
                      {(statuses ?? []).filter((x) => x.is_active && x.key !== "excused").map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                    </Select>
                  </div>
                  {mapping.event_date == null ? (
                    <div>
                      <label htmlFor="file_event_date" className="block text-xs font-medium text-slate-700">Event date for the whole file (optional)</label>
                      <Input id="file_event_date" name="file_event_date" type="date" className="mt-1 h-8 w-44 text-xs" />
                    </div>
                  ) : null}
                  <SubmitButton size="sm" variant="secondary">Re-read rows with this mapping</SubmitButton>
                </div>
                {problems.warnings.map((w) => <p key={w} className="text-xs text-amber-800">⚠ {w}</p>)}
              </ActionForm>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-brand">Show the first rows of the file</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs">
                    <thead><tr>{imp.headers.map((h, i) => <th key={i} className="border-b px-2 py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody>{rows.slice(0, 5).map((r) => <tr key={r.id}>{((r.raw as { cells: string[] }).cells ?? []).map((c, i) => <td key={i} className="border-b px-2 py-1 text-slate-600">{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </details>
            </CardBody>
          </Card>

          <Card className="mb-5">
            <CardHeader title="Step 3 · Events" description="Exact PIN names are matched automatically. Similar names are only suggestions — choose the event yourself." />
            <CardBody>
              <ActionForm action={saveEventResolution} className="space-y-3">
                <input type="hidden" name="import_id" value={id} />
                {groups.map((g) => {
                  const res = resolution[g.key];
                  const current = res?.action === "map" ? `event:${res.event_id}` : res?.action === "defer" ? "defer" : "auto";
                  const auto = !res && g.resolvedEvent ? evById.get(g.resolvedEvent) : null;
                  const sugg = suggestFor(g.name, g.date);
                  return (
                    <div key={g.key} className="rounded-md border border-slate-200 p-3">
                      <input type="hidden" name="group" value={g.key} />
                      <input type="hidden" name={`pin:${g.key}`} value={g.name ?? ""} />
                      <input type="hidden" name={`date:${g.key}`} value={g.date ?? ""} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{g.name ?? (g.key.startsWith(FILE_GROUP) ? "Whole file (no event-name column)" : "—")} <span className="text-xs text-slate-500">{g.date ? formatDate(g.date) : "no date"} · {g.rows} rows</span></p>
                        {auto ? <Badge tone="green">Matched exactly: {auto.name} ({formatDate(auto.event_date)})</Badge> : g.resolvedEvent ? <Badge tone="blue">Mapped</Badge> : res?.action === "defer" ? <Badge tone="amber">Deferred</Badge> : <Badge tone="amber">Needs a decision</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`c-${g.key}`}>Event for {g.name}</label>
                        <Select id={`c-${g.key}`} name={`choice:${g.key}`} defaultValue={current} className="h-8 max-w-md text-xs">
                          <option value="auto">{auto ? `Keep exact match (${auto.name})` : "Automatic (exact PIN name only)"}</option>
                          {sugg.length ? <optgroup label="Suggestions (similar name/date)">{sugg.map(({ e }) => <option key={e.id} value={`event:${e.id}`}>{formatDate(e.event_date)} — {e.name}</option>)}</optgroup> : null}
                          <optgroup label="All events">{(semEvents ?? []).map((e) => <option key={e.id} value={`event:${e.id}`}>{formatDate(e.event_date)} — {e.name}</option>)}</optgroup>
                          {s.can("events.write") ? <option value="create">➕ Create a new event from this export</option> : null}
                          <option value="defer">Defer — send these rows to the review queue</option>
                        </Select>
                        {g.name ? <Checkbox name={`remember:${g.key}`} defaultChecked label="Remember this PIN name for future imports" className="text-xs" /> : null}
                      </div>
                      {s.can("events.write") ? (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-slate-500">New event details (used only with “Create a new event”)</summary>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Input name={`newname:${g.key}`} defaultValue={g.name ?? ""} placeholder="Event name" className="h-8 w-64 text-xs" aria-label="New event name" />
                            <Select name={`newcat:${g.key}`} className="h-8 w-40 text-xs" aria-label="New event category">
                              <option value="">No category</option>
                              {(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                            </Select>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
                <SubmitButton size="sm" variant="secondary">Save event matching</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </>
      ) : null}

      <Card className="mb-5">
        <CardHeader title={editable ? "Step 4 · Preview every row" : "Rows"} description={filter ? `Showing: ${OUTCOME[filter]?.label ?? filter}` : "All rows (first 500)"}
          actions={filter ? <Link className="text-xs text-brand" href={hrefWith(`/attendance/import/${id}`, q, { outcome: null })}>Show all</Link> : null} />
        <ActionForm action={commitImport} confirm={editable ? { title: "Commit this import?", body: `${sum.new ?? 0} new attendance record(s) will be saved. Duplicates are skipped; unmatched and unmapped rows go to the review queue. This can be corrected later but every change is audited.`, confirmLabel: "Commit import" } : undefined}>
          <input type="hidden" name="import_id" value={id} />
          <Table>
            <THead><tr><TH>#</TH><TH>Name</TH><TH>Email / card</TH><TH>Event</TH><TH>Status</TH><TH>Result</TH>{editable && conflicts.length ? <TH>Decision</TH> : null}</tr></THead>
            <TBody>
              {shown.map((r) => {
                const o = OUTCOME[r.outcome ?? ""] ?? { label: "Not checked", tone: "neutral" as Tone };
                return (
                  <TR key={r.id}>
                    <TD className="tabular text-xs text-slate-400">{r.row_number}</TD>
                    <TD>{[r.first_name, r.last_name].filter(Boolean).join(" ") || <span className="text-slate-400">—</span>}{r.person_type && r.person_type !== "unmatched" ? <span className="block text-xs text-slate-400">{r.person_type} · by {r.match_method}</span> : null}</TD>
                    <TD className="text-xs">{r.email ?? <span className="text-amber-700">no email</span>}{r.card_id ? <span className="block text-slate-400">{r.card_id}</span> : null}</TD>
                    <TD className="text-xs">{r.event_id ? evById.get(r.event_id)?.name ?? "mapped" : r.pin_event_name ?? "—"}{r.event_date ? <span className="block text-slate-400">{formatDate(r.event_date)}</span> : null}</TD>
                    <TD className="text-xs">{r.status_raw ?? <span className="text-slate-400">(default)</span>}</TD>
                    <TD><Badge tone={o.tone}>{o.label}</Badge>{r.message ? <span className="mt-0.5 block max-w-xs text-xs text-slate-500">{r.message}</span> : null}</TD>
                    {editable && conflicts.length ? (
                      <TD>{r.outcome === "conflict" ? (
                        <Select name={`decision:${r.id}`} defaultValue="keep" className="h-8 w-40 text-xs" aria-label={`Decision for row ${r.row_number}`}>
                          <option value="keep">Keep existing</option><option value="replace">Use the file’s status</option>
                        </Select>) : null}</TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {editable ? (
            <div className="space-y-3 border-t border-slate-100 p-5">
              <Checkbox name="create_prospects" label="Create prospective-member records for unmatched people who have a valid email"
                hint="Off by default. Never creates full members. People without an email, or whose card ID belongs to someone else, still go to the review queue." />
              <Checkbox name="is_complete_roster" label="This file is the COMPLETE roster for its event(s)" hint="Only tick this if everyone who attended is in the file." />
              <Checkbox name="reconcile_absent" label="…and mark Active members who are not in the file as Absent" hint="Requires the box above. Without it, nobody is ever marked absent just for being missing from a file." />
              <div className="flex flex-wrap gap-2 pt-1">
                <SubmitButton pendingLabel="Committing…">Commit import</SubmitButton>
              </div>
            </div>
          ) : null}
        </ActionForm>
      </Card>
      {editable ? (
        <ActionForm action={cancelImport} confirm={{ title: "Cancel this import?", body: "Nothing from this file will be recorded. The upload stays in the import history as cancelled.", confirmLabel: "Cancel import", danger: true }}>
          <input type="hidden" name="import_id" value={id} />
          <SubmitButton variant="danger-outline" size="sm">Cancel import</SubmitButton>
        </ActionForm>
      ) : null}
      {normalizeText(imp.notes) ? <p className="mt-3 text-xs text-slate-500">{imp.notes}</p> : null}
    </>
  );
}
