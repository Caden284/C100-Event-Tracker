"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/misc";
import { commitWorkbook, previewWorkbook } from "./actions";

type PreviewResult = Awaited<ReturnType<typeof previewWorkbook>>;
type Preview = Extract<PreviewResult, { ok: true }>["preview"];

function downloadCsv(name: string, rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v.replace(/^([=+\-@])/, "'$1"));
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function MigrationWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const runPreview = () => {
    if (!file) return;
    setError(null); setSummary(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await previewWorkbook(fd);
      if (res.ok) {
        setPreview(res.preview); setStart(res.preview.semester.start_date); setEnd(res.preview.semester.end_date);
      } else setError(res.error);
    });
  };
  const runCommit = () => {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("start_date", start); fd.set("end_date", end); fd.set("confirm", confirm ? "on" : "");
    startTransition(async () => {
      const res = await commitWorkbook(fd);
      if (res.ok) setSummary(res.summary);
      else setError(res.error);
    });
  };

  const levels = preview ? { error: 0, warning: 0, info: 0, ...Object.fromEntries(["error", "warning", "info"].map((l) => [l, preview.warnings.filter((w) => w.level === l).length])) } : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="1. Choose the workbook" description="C100_Membership_Tracker.xlsx — it is read on the server and nothing is saved until you commit." />
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Workbook (.xlsx)" htmlFor="wb-file" className="min-w-64 flex-1">
            <Input id="wb-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSummary(null); }} />
          </Field>
          <Button onClick={runPreview} disabled={!file || pending}>
            {pending && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Preview migration
          </Button>
        </CardBody>
      </Card>

      {error ? <Callout tone="danger" title="Could not continue">{error}</Callout> : null}

      {preview && !summary ? (
        <>
          <Card>
            <CardHeader title="2. Review what was found" description={`${preview.file.name} · SHA-256 ${preview.file.sha256.slice(0, 12)}…`} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {preview.sheets.map((sh) => <Badge key={sh.name} tone={sh.present ? "green" : "red"}>{sh.present ? "✓" : "✗"} {sh.name}</Badge>)}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(preview.counts).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-slate-200 px-3 py-2"><dt className="text-xs text-slate-500">{k.replace(/_/g, " ")}</dt><dd className="tabular text-lg font-semibold">{v}</dd></div>
                ))}
              </dl>
              {preview.existing.sameFileRuns > 0 ? (
                <Callout tone="info" title="This exact file was already migrated">Committing again is safe: existing records are matched and nothing is duplicated or overwritten.</Callout>
              ) : preview.existing.previousRuns > 0 ? (
                <Callout tone="info" title="A previous migration exists">Records already in the database (matched by email or name key) are kept as they are; only new records are added.</Callout>
              ) : null}
              <Callout tone="draft" title="Workbook standards will be imported as a DRAFT policy">
                {preview.policy.rules.requirements.map((r) => `${r.label}: ${r.required}`).join(" · ")} · dues required for Good Standing · Standout at {preview.policy.rules.standout_multiplier}×.
                Strike thresholds ({preview.policy.rules.strikes.thresholds.map((t) => `${t.strikes} = ${t.label}`).join(", ")}) are imported but <strong>not activated</strong>.
              </Callout>
              <div>
                <h3 className="text-sm font-semibold">Verification against the workbook’s own formulas</h3>
                {preview.verification.mismatches.length === 0 ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Recalculated attendance matches the workbook for all {preview.verification.checked} members with an email.</p>
                ) : (
                  <p className="mt-1 text-sm text-amber-800">{preview.verification.mismatches.length} value(s) differ from the workbook’s cached formulas — see the report. The app’s numbers come from the attendance log; official statuses are not changed.</p>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Data-quality findings (${levels?.warning ?? 0} warnings · ${levels?.info ?? 0} notes)`}
              description="Nothing is discarded or merged automatically. Unresolvable rows go to the unmatched-scan review queue."
              actions={
                <Button variant="secondary" size="sm" onClick={() => downloadCsv("workbook-migration-report.csv", [
                  ["Level", "Sheet", "Finding"], ...preview.warnings.map((w) => [w.level, w.sheet, w.message]),
                  ...preview.verification.mismatches.map((m) => ["mismatch", "Members", `${m.name} ${m.field}: workbook ${m.workbook}, app ${m.app}`]),
                ])}><Download className="h-4 w-4" /> Download report</Button>
              }
            />
            <CardBody className="max-h-80 overflow-y-auto p-0">
              <ul className="divide-y divide-slate-100 text-sm">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="flex gap-3 px-5 py-2">
                    <Badge tone={w.level === "warning" ? "amber" : w.level === "error" ? "red" : "neutral"}>{w.level}</Badge>
                    <span className="text-xs text-slate-500 w-32 flex-none">{w.sheet}</span>
                    <span className="text-slate-700">{w.message}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="3. Confirm the semester and commit" description="Everything is written in a single transaction. If anything fails, nothing is saved." />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Semester"><Input value={`${preview.semester.name} (${preview.semester.academic_year})`} disabled /></Field>
                <Field label="Start date" htmlFor="sd" hint="Not in the workbook — adjust if needed"><Input id="sd" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                <Field label="End date" htmlFor="ed"><Input id="ed" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
              </div>
              <Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)}
                label="I reviewed the preview. Import these records; keep the policy as a draft until the executive board approves it." />
              <Button onClick={runCommit} disabled={!confirm || pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Commit migration
              </Button>
            </CardBody>
          </Card>
        </>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader title="Migration complete" description="Totals were recalculated from the imported attendance log." />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(summary).filter(([k]) => !k.endsWith("_id") && k !== "run_id").map(([k, v]) => (
                <div key={k} className="rounded-md border border-slate-200 px-3 py-2"><dt className="text-xs text-slate-500">{k.replace(/_/g, " ")}</dt><dd className="tabular font-semibold">{String(v)}</dd></div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="text-brand underline" href="/">Open the dashboard</Link>
              <Link className="text-brand underline" href="/attendance/unmatched">Review unmatched scans</Link>
              <Link className="text-brand underline" href="/settings/policies">Review the draft policy</Link>
              <Link className="text-brand underline" href="/members?standing=no_email">Members missing email</Link>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
