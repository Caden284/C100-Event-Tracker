import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { listSemesters } from "@/lib/data/semesters";
import { candidatesFor } from "@/lib/data/recognition";
import { displayName } from "@/lib/domain/normalize";
import { PageHeader, Callout, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { nominate, retractVote, saveResult, setPeriodStatus, vote, withdrawNomination } from "../actions";

export const metadata = { title: "Recognition period" };
const NEXT: Record<string, { status: string; label: string }[]> = {
  setup: [{ status: "nominations_open", label: "Open nominations" }],
  nominations_open: [{ status: "voting_open", label: "Close nominations & open voting" }, { status: "closed", label: "Close (no voting)" }],
  voting_open: [{ status: "closed", label: "Close voting" }],
  closed: [{ status: "finalized", label: "Finalize results" }, { status: "voting_open", label: "Re-open voting" }],
  finalized: [],
};

export default async function PeriodPage({ params }: PageProps<"/recognition/[periodId]">) {
  const { periodId } = await params;
  const s = await requirePermission("recognition.read");
  const { data: p } = await s.supabase.from("recognition_periods").select("*, recognition_categories(*), semesters(*)").eq("id", periodId).maybeSingle();
  if (!p) notFound();
  const cat = p.recognition_categories as { key: string; name: string; audience: string; uses_nominations: boolean; uses_voting: boolean; uses_auto_eligibility: boolean; eligibility_rules: unknown; description: string | null };
  const sem = p.semesters as Parameters<typeof candidatesFor>[2];
  const [semesters, { data: noms }, { data: myVotes }, { data: results }] = await Promise.all([
    listSemesters(s.supabase),
    s.supabase.from("recognition_nominations").select("id, nominee_person_id, nominated_by, justification, created_at, people(first_name, last_name, preferred_name), profiles(full_name, email)").eq("period_id", periodId),
    s.supabase.from("recognition_votes").select("nominee_person_id").eq("period_id", periodId),
    s.supabase.from("recognition_results").select("id, person_id, outcome, is_official, note, approved_at, people(first_name, last_name, preferred_name)").eq("period_id", periodId),
  ]);
  const candidates = cat.uses_auto_eligibility || cat.uses_nominations ? await candidatesFor(s, cat, sem, semesters) : [];
  const tally = await s.supabase.rpc("recognition_vote_tally", { p_period: periodId });
  const votes = new Map(((tally.data ?? []) as { nominee_person_id: string; votes: number }[]).map((t) => [t.nominee_person_id, Number(t.votes)]));
  const voted = new Set((myVotes ?? []).map((v) => v.nominee_person_id));
  const nominees = new Map<string, { name: string; count: number; justifications: { by: string; text: string | null; id: string; mine: boolean }[] }>();
  for (const n of noms ?? []) {
    const x = nominees.get(n.nominee_person_id) ?? { name: displayName(n.people as never), count: 0, justifications: [] };
    x.count++;
    const by = n.profiles as { full_name: string | null; email: string } | null;
    x.justifications.push({ by: s.can("recognition.manage") ? by?.full_name ?? by?.email ?? "" : "an officer", text: n.justification, id: n.id, mine: n.nominated_by === s.userId });
    nominees.set(n.nominee_person_id, x);
  }
  const eligible = candidates.filter((c) => c.eligible);
  const nominatable = (cat.uses_auto_eligibility ? eligible : candidates).slice(0, 300);
  return (
    <>
      <PageHeader title={p.name} back={{ href: "/recognition", label: "Recognition" }} badge={<Badge tone={p.status === "finalized" ? "green" : "amber"}>{p.status.replace(/_/g, " ")}</Badge>}
        description={`${cat.name} · ${sem.name} · ${cat.audience === "member" ? "members" : "prospective members"}${p.anonymous_voting ? " · anonymous ballots" : ""}`}
        actions={s.can("recognition.manage") ? NEXT[p.status].map((n) => (
          <ActionForm key={n.status} action={setPeriodStatus} showMessage={false} confirm={n.status === "finalized" ? { title: "Finalize results?", body: "Official recipients become visible to all officers with recognition access." } : undefined}>
            <input type="hidden" name="period_id" value={periodId} /><input type="hidden" name="status" value={n.status} />
            <SubmitButton size="sm" variant={n.status === "finalized" ? "primary" : "secondary"}>{n.label}</SubmitButton>
          </ActionForm>)) : null} />
      <Callout tone="info" className="mb-4">Four separate things: <strong>eligible candidates</strong> (calculated), <strong>nominations</strong> (officers), <strong>voting results</strong> (tallies), and <strong>official recipients</strong> (approved by an authorized officer).</Callout>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`1 · Eligible candidates (${eligible.length})`} description="Calculated from attendance. Informational." />
          <CardBody className="max-h-96 overflow-y-auto p-0">
            <ul className="divide-y divide-slate-100 text-sm">{candidates.slice(0, 60).map((c) => (
              <li key={c.person_id} className="flex items-start justify-between gap-2 px-5 py-2"><span><Link className="font-medium hover:text-brand" href={c.href}>{c.name}</Link><span className="block text-xs text-slate-500">{c.detail}</span></span><Badge tone={c.eligible ? "green" : "neutral"}>{c.eligible ? "eligible" : "not eligible"}</Badge></li>
            ))}</ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`2 · Nominations (${nominees.size} nominee${nominees.size === 1 ? "" : "s"})`} />
          <CardBody className="space-y-3">
            {cat.uses_nominations && p.status === "nominations_open" && s.can("recognition.nominate") ? (
              <ActionForm action={nominate} className="space-y-2" resetOnSuccess>
                <input type="hidden" name="period_id" value={periodId} />
                <Select name="person_id" required defaultValue="" aria-label="Nominee"><option value="" disabled>Nominate…</option>{nominatable.map((c) => <option key={c.person_id} value={c.person_id}>{c.name}</option>)}</Select>
                <Textarea name="justification" placeholder="Why? (optional)" aria-label="Justification" />
                <SubmitButton size="sm">Submit nomination</SubmitButton>
              </ActionForm>
            ) : !cat.uses_nominations ? <p className="text-xs text-slate-500">This award does not use nominations.</p> : <p className="text-xs text-slate-500">Nominations are {p.status === "setup" ? "not open yet" : "closed"}.</p>}
            {nominees.size === 0 ? <EmptyState title="No nominations yet" /> : (
              <ul className="space-y-2 text-sm">{[...nominees.entries()].map(([pid, n]) => (
                <li key={pid} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{n.name}</span><span className="text-xs text-slate-500">{n.count} nomination{n.count === 1 ? "" : "s"}</span></div>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">{n.justifications.map((j) => <li key={j.id}>“{j.text ?? "—"}” — {j.by}{j.mine && p.status === "nominations_open" ? (
                    <ActionForm action={withdrawNomination} showMessage={false} className="inline"><input type="hidden" name="id" value={j.id} /><input type="hidden" name="period_id" value={periodId} /> <button className="text-red-700 underline">withdraw</button></ActionForm>) : null}</li>)}</ul>
                  {cat.uses_voting && p.status === "voting_open" && s.can("recognition.vote") ? (
                    <ActionForm action={voted.has(pid) ? retractVote : vote} className="mt-2" showMessage>
                      <input type="hidden" name="period_id" value={periodId} /><input type="hidden" name="person_id" value={pid} />
                      <SubmitButton size="sm" variant={voted.has(pid) ? "secondary" : "primary"}>{voted.has(pid) ? "✓ Voted — withdraw" : "Vote"}</SubmitButton>
                    </ActionForm>
                  ) : null}
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="3 · Voting results" description={p.anonymous_voting ? "Totals only — ballots are anonymous." : "Totals"} />
          <CardBody>
            {!cat.uses_voting ? <p className="text-xs text-slate-500">This award does not use voting.</p> : tally.error ? <p className="text-sm text-slate-500">{tally.error.message}</p> : votes.size === 0 ? <EmptyState title="No votes yet" /> : (
              <Table><THead><tr><TH>Nominee</TH><TH className="text-right">Votes</TH></tr></THead>
                <TBody>{[...votes.entries()].map(([pid, v]) => <TR key={pid}><TD>{nominees.get(pid)?.name ?? candidates.find((c) => c.person_id === pid)?.name ?? "—"}</TD><TD className="tabular text-right">{v}</TD></TR>)}</TBody></Table>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="4 · Official recipients" />
          <CardBody className="space-y-3">
            <ul className="space-y-1 text-sm">{(results ?? []).map((r) => <li key={r.id} className="flex items-center gap-2">{displayName(r.people as never)} <Badge tone={r.is_official ? "gold" : "draft"}>{r.is_official ? `Official ${r.outcome.replace("_", " ")}` : "Unofficial — awaiting approval"}</Badge></li>)}</ul>
            {(results ?? []).length === 0 ? <p className="text-xs text-slate-500">No recipient recorded.</p> : null}
            {s.can("recognition.manage") || s.can("recognition.approve") ? (
              <ActionForm action={saveResult} className="space-y-2" resetOnSuccess>
                <input type="hidden" name="period_id" value={periodId} />
                <Field label="Recipient" htmlFor="rp"><Select id="rp" name="person_id" required defaultValue=""><option value="" disabled>Choose…</option>{[...nominees.entries()].map(([pid, n]) => <option key={pid} value={pid}>{n.name} (nominated)</option>)}{candidates.filter((c) => !nominees.has(c.person_id)).slice(0, 200).map((c) => <option key={c.person_id} value={c.person_id}>{c.name}</option>)}</Select></Field>
                <Select name="outcome" aria-label="Outcome"><option value="recipient">Recipient</option><option value="honorable_mention">Honorable mention</option></Select>
                <Input name="note" placeholder="Note (e.g. decided at Dec 4 e-board meeting)" aria-label="Note" />
                {s.can("recognition.approve") ? <Checkbox name="is_official" label="Approve as the official result" /> : <p className="text-xs text-slate-500">An approver must make this official.</p>}
                <SubmitButton size="sm">Save result</SubmitButton>
              </ActionForm>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
