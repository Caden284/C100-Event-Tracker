import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { candidatesFor } from "@/lib/data/recognition";
import { fetchAll } from "@/lib/data/fetch-all";
import { displayName } from "@/lib/domain/normalize";
import { countedCategories, parseRules } from "@/lib/domain/policy";
import { rank } from "@/lib/domain/recognition";
import { PageHeader, Callout, EmptyState, Tabs } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { sp } from "@/lib/url";
import { adjustPoints, awardPoints, createPeriod, savePointRule, saveCategory, setPointRuleStatus } from "./actions";

export const metadata = { title: "Recognition" };

export default async function RecognitionPage({ searchParams }: PageProps<"/recognition">) {
  const params = await searchParams;
  const s = await requirePermission("recognition.read", "points.read");
  const tab = sp(params, "tab") ?? (s.can("recognition.read") ? "awards" : "leaderboard");
  const { current, all } = await resolveSemester(s.supabase);
  const tabs = [
    ...(s.can("recognition.read") ? [{ key: "awards", label: "Awards", href: "/recognition?tab=awards" }, { key: "candidates", label: "Eligible candidates", href: "/recognition?tab=candidates" }] : []),
    { key: "leaderboard", label: "Leaderboards", href: "/recognition?tab=leaderboard" },
    ...(s.can("points.read") ? [{ key: "points", label: "Points", href: "/recognition?tab=points" }] : []),
  ];
  return (
    <>
      <PageHeader title="Recognition" description="Eligibility, nominations, voting and official results are kept separate. A leaderboard is a participation tool, not an award decision." />
      <Tabs tabs={tabs} current={tab} />
      <div className="mt-4">
        {tab === "awards" ? <Awards s={s} semesters={all} currentId={current?.id ?? null} /> : null}
        {tab === "candidates" && current ? <Candidates s={s} semester={current} all={all} categoryKey={sp(params, "category")} /> : null}
        {tab === "leaderboard" && current ? <Leaderboard s={s} semester={current} all={all} kind={sp(params, "board") ?? "semester"} anonymize={sp(params, "names") === "initials"} /> : null}
        {tab === "points" && current ? <Points s={s} semester={current} /> : null}
        {!current && tab !== "awards" ? <EmptyState title="No semester selected" /> : null}
      </div>
    </>
  );
}

type S = Awaited<ReturnType<typeof requirePermission>>;
type Sem = NonNullable<Awaited<ReturnType<typeof resolveSemester>>["current"]>;

async function Awards({ s, semesters, currentId }: { s: S; semesters: Sem[]; currentId: string | null }) {
  const [{ data: cats }, { data: periods }] = await Promise.all([
    s.supabase.from("recognition_categories").select("*").order("created_at"),
    s.supabase.from("recognition_periods").select("*, recognition_categories(name), semesters(name)").order("created_at", { ascending: false }),
  ]);
  const method = (c: { uses_auto_eligibility: boolean; uses_nominations: boolean; uses_voting: boolean; uses_officer_decision: boolean }) =>
    [c.uses_auto_eligibility && "eligibility", c.uses_nominations && "nominations", c.uses_voting && "voting", c.uses_officer_decision && "officer decision"].filter(Boolean).join(" + ");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Nomination & voting periods" description="Each period moves through setup → nominations → voting → closed → finalized." />
          {(periods ?? []).length === 0 ? <EmptyState title="No periods yet">Create one on the right to start nominations.</EmptyState> : (
            <Table>
              <THead><tr><TH>Period</TH><TH>Award</TH><TH>Semester</TH><TH>Status</TH></tr></THead>
              <TBody>{(periods ?? []).map((p) => (
                <TR key={p.id}><TD><Link className="font-medium hover:text-brand" href={`/recognition/${p.id}`}>{p.name}</Link></TD><TD>{(p.recognition_categories as { name: string }).name}</TD>
                  <TD>{(p.semesters as { name: string }).name}</TD><TD><Badge tone={p.status === "finalized" ? "green" : p.status === "setup" ? "neutral" : "amber"}>{p.status.replace(/_/g, " ")}</Badge></TD></TR>
              ))}</TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Award categories" description="Configure how each award is decided. Rules left blank mean “not configured” — officers review every candidate." />
          <CardBody className="space-y-4">
            {(cats ?? []).map((c) => {
              const r = c.eligibility_rules as Record<string, unknown>;
              return (
                <details key={c.id} className="rounded-md border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium">{c.name} <Badge tone={c.audience === "member" ? "blue" : "gold"}>{c.audience === "member" ? "Members" : "Prospective members"}</Badge> <span className="text-xs text-slate-500">{method(c)}</span>{c.is_active ? null : <Badge>inactive</Badge>}</summary>
                  <p className="mt-2 text-xs text-slate-600">{c.description}</p>
                  {s.can("recognition.manage") ? <CategoryForm c={c} rules={r} /> : null}
                </details>
              );
            })}
            {s.can("recognition.manage") ? <details className="rounded-md border border-dashed border-slate-300 p-3"><summary className="cursor-pointer text-sm font-medium text-brand">+ Add an award category</summary><CategoryForm /></details> : null}
          </CardBody>
        </Card>
      </div>
      {s.can("recognition.manage") ? (
        <Card>
          <CardHeader title="New period" />
          <CardBody>
            <ActionForm action={createPeriod} className="space-y-3" resetOnSuccess>
              <Field label="Award" htmlFor="pc"><Select id="pc" name="category_id" required>{(cats ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Semester" htmlFor="ps"><Select id="ps" name="semester_id" defaultValue={currentId ?? ""}>{semesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field label="Name" htmlFor="pn"><Input id="pn" name="name" required placeholder="Fall 2026 awards" /></Field>
              <Field label="Nominations close" htmlFor="nc"><Input id="nc" name="nomination_closes_at" type="datetime-local" /></Field>
              <Field label="Voting closes" htmlFor="vc"><Input id="vc" name="voting_closes_at" type="datetime-local" /></Field>
              <Field label="Votes per voter" htmlFor="mv"><Input id="mv" name="max_votes_per_voter" type="number" min={1} max={10} defaultValue={1} /></Field>
              <Field label="Who can see vote counts" htmlFor="rv"><Select id="rv" name="results_visibility"><option value="approvers">Award managers & approvers only</option><option value="officers">All officers, after voting closes</option></Select></Field>
              <Checkbox name="anonymous_voting" defaultChecked label="Anonymous ballots" hint="Only totals are ever shown, never who voted for whom." />
              <SubmitButton size="sm">Create period</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function CategoryForm({ c, rules }: { c?: { id: string; name: string; description: string | null; audience: string; uses_auto_eligibility: boolean; uses_nominations: boolean; uses_voting: boolean; uses_officer_decision: boolean; is_active: boolean }; rules?: Record<string, unknown> }) {
  const n = (k: string) => (typeof rules?.[k] === "number" ? String(rules[k]) : "");
  const audience = c?.audience ?? "member";
  return (
    <ActionForm action={saveCategory} className="mt-3 space-y-3">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`cn-${c?.id}`}><Input id={`cn-${c?.id}`} name="name" defaultValue={c?.name} required /></Field>
        <Field label="Audience" htmlFor={`ca-${c?.id}`}><Select id={`ca-${c?.id}`} name="audience" defaultValue={audience}><option value="member">Members</option><option value="prospect">Prospective members</option></Select></Field>
      </div>
      <Textarea name="description" defaultValue={c?.description ?? ""} placeholder="Description" aria-label="Description" />
      <div className="flex flex-wrap gap-4">
        <Checkbox name="uses_auto_eligibility" defaultChecked={c?.uses_auto_eligibility ?? true} label="Calculated eligibility" />
        <Checkbox name="uses_nominations" defaultChecked={c?.uses_nominations ?? true} label="Nominations" />
        <Checkbox name="uses_voting" defaultChecked={c?.uses_voting ?? false} label="Voting" />
        <Checkbox name="uses_officer_decision" defaultChecked={c?.uses_officer_decision ?? true} label="Officer decision" />
        <Checkbox name="inactive" defaultChecked={c ? !c.is_active : false} label="Inactive" />
      </div>
      <p className="text-xs font-medium text-slate-600">Eligibility thresholds (leave blank = not configured)</p>
      {audience === "member" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min. counted events" htmlFor={`m1-${c?.id}`}><Input id={`m1-${c?.id}`} name="min_counted_events" type="number" min={0} defaultValue={n("min_counted_events")} /></Field>
          <Field label="Min. categories attended" htmlFor={`m2-${c?.id}`}><Input id={`m2-${c?.id}`} name="min_categories_attended" type="number" min={0} defaultValue={n("min_categories_attended")} /></Field>
          <Field label="Most-improved baseline events" htmlFor={`m3-${c?.id}`}><Input id={`m3-${c?.id}`} name="min_baseline_events" type="number" min={0} defaultValue={n("min_baseline_events")} /></Field>
          <Checkbox name="require_active" defaultChecked={Array.isArray(rules?.require_member_status) && (rules!.require_member_status as string[]).length > 0} label="Active members only" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Min. events attended" htmlFor={`p1-${c?.id}`}><Input id={`p1-${c?.id}`} name="min_events_attended" type="number" min={0} defaultValue={n("min_events_attended")} /></Field>
          <Field label="Min. months with participation" htmlFor={`p2-${c?.id}`}><Input id={`p2-${c?.id}`} name="min_distinct_months" type="number" min={0} defaultValue={n("min_distinct_months")} /></Field>
        </div>
      )}
      <SubmitButton size="sm" variant="secondary">Save award</SubmitButton>
    </ActionForm>
  );
}

async function Candidates({ s, semester, all, categoryKey }: { s: S; semester: Sem; all: Sem[]; categoryKey?: string }) {
  const { data: cats } = await s.supabase.from("recognition_categories").select("*").eq("is_active", true).order("created_at");
  const cat = (cats ?? []).find((c) => c.key === categoryKey) ?? (cats ?? [])[0];
  if (!cat) return <EmptyState title="No award categories" />;
  const list = await candidatesFor(s, cat, semester, all);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">{(cats ?? []).map((c) => <Link key={c.key} href={`/recognition?tab=candidates&category=${c.key}`} className={`rounded-full px-3 py-1 text-xs font-medium ${c.key === cat.key ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{c.name}</Link>)}</div>
      <Callout tone="info" className="mb-3" title="Calculated eligibility — not nominations, votes, or official recipients">{cat.description}</Callout>
      <Card>
        <CardHeader title={`${cat.name} · ${semester.name}`} description={`${list.filter((x) => x.eligible).length} eligible of ${list.length}`} />
        <Table>
          <THead><tr><TH>#</TH><TH>Candidate</TH><TH>Basis</TH><TH>Eligibility</TH></tr></THead>
          <TBody>{list.slice(0, 100).map((c, i) => (
            <TR key={c.person_id}><TD className="tabular text-xs text-slate-400">{i + 1}</TD><TD><Link className="font-medium hover:text-brand" href={c.href}>{c.name}</Link></TD><TD className="text-xs">{c.detail}</TD>
              <TD><Badge tone={c.eligible ? "green" : "neutral"}>{c.eligible ? (c.configured ? "Eligible" : "Listed for review") : "Not eligible"}</Badge><ul className="mt-1 text-xs text-slate-500">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul></TD></TR>
          ))}</TBody>
        </Table>
      </Card>
    </>
  );
}

async function Leaderboard({ s, semester, all, kind, anonymize }: { s: S; semester: Sem; all: Sem[]; kind: string; anonymize: boolean }) {
  const semIds = kind === "year" ? all.filter((x) => x.academic_year === semester.academic_year).map((x) => x.id) : [semester.id];
  const [facts, pts, policyRow] = await Promise.all([
    s.can("attendance.read") ? fetchAll((from, to) => s.supabase.from("v_attendance_detail").select("person_id, member_id, effective_category, counts_as_attended, first_name, last_name").in("semester_id", semIds).not("member_id", "is", null).order("id").range(from, to)) : Promise.resolve([]),
    kind === "points" && s.can("points.read") ? fetchAll((from, to) => s.supabase.from("point_transactions").select("person_id, points, people(first_name, last_name, preferred_name)").eq("semester_id", semester.id).order("id").range(from, to)) : Promise.resolve([]),
    semester.policy_id ? s.supabase.from("membership_policies").select("rules").eq("id", semester.policy_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const counted = countedCategories(parseRules(policyRow.data?.rules));
  const tally = new Map<string, { name: string; score: number }>();
  const add = (id: string, name: string, n: number) => { const t = tally.get(id) ?? { name, score: 0 }; t.score += n; tally.set(id, t); };
  if (kind === "points") for (const p of pts) add(p.person_id, displayName(p.people as never), p.points);
  else for (const f of facts) {
    if (!f.counts_as_attended) continue;
    const name = displayName(f);
    if (kind === "attendance") add(f.person_id!, name, 1);
    else if (kind === "service") { if (f.effective_category === "service") add(f.person_id!, name, 1); }
    else if (kind === "mentoring") { if (f.effective_category === "mentoring") add(f.person_id!, name, 1); }
    else if (f.effective_category && counted.has(f.effective_category)) add(f.person_id!, name, 1);
  }
  const ranked = rank([...tally.values()].filter((t) => t.score !== 0), (t) => t.score);
  const boards = [["semester", "Semester participation"], ["year", "Academic year"], ["attendance", "All event attendance"], ["service", "Service"], ["mentoring", "Mentoring"], ["points", "Approved points"]];
  const initials = (n: string) => n.split(" ").map((x) => x[0]).join(".") + ".";
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {boards.map(([k, l]) => <Link key={k} href={`/recognition?tab=leaderboard&board=${k}${anonymize ? "&names=initials" : ""}`} className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{l}</Link>)}
        <Link href={`/recognition?tab=leaderboard&board=${kind}${anonymize ? "" : "&names=initials"}`} className="ml-auto text-xs text-brand hover:underline">{anonymize ? "Show full names" : "Show initials only (for sharing)"}</Link>
      </div>
      <Card>
        <CardHeader title={boards.find((b) => b[0] === kind)?.[1] ?? "Leaderboard"} description={`${kind === "year" ? semester.academic_year : semester.name} · members only · contains no standing, dues or disciplinary information`} />
        {ranked.length === 0 ? <EmptyState title={kind === "points" ? "No approved points awarded yet" : "No attendance yet"} /> : (
          <Table>
            <THead><tr><TH className="w-12">Rank</TH><TH>Member</TH><TH className="text-right">{kind === "points" ? "Points" : "Events"}</TH></tr></THead>
            <TBody>{ranked.slice(0, 50).map((r, i) => <TR key={i}><TD className="tabular font-semibold">{r.rank}</TD><TD>{anonymize ? initials(r.name) : r.name}</TD><TD className="tabular text-right">{r.score}</TD></TR>)}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

async function Points({ s, semester }: { s: S; semester: Sem }) {
  const [{ data: rules }, { data: cats }, tx, people] = await Promise.all([
    s.supabase.from("point_rules").select("*").order("created_at", { ascending: false }),
    s.supabase.from("event_categories").select("key, name").order("sort_order"),
    fetchAll((from, to) => s.supabase.from("point_transactions").select("id, points, reason, created_at, people(first_name, last_name, preferred_name), events(name)").eq("semester_id", semester.id).order("created_at", { ascending: false }).range(from, to)),
    s.can("points.award") ? fetchAll((from, to) => s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, member_id").not("member_id", "is", null).order("last_name").order("person_id").range(from, to)) : Promise.resolve([]),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Callout tone="draft" title="No official point values are set">The chapter defines point values. Rules start as drafts and award nothing until a policy approver approves them.</Callout>
        <Card>
          <CardHeader title="Point rules" actions={s.can("points.award") ? (
            <ActionForm action={awardPoints} showMessage confirm={{ title: `Award points for ${semester.name}?`, body: "Applies every APPROVED rule to counted attendance. Attendance that already earned points under a rule is skipped." }}>
              <input type="hidden" name="semester_id" value={semester.id} /><SubmitButton size="sm" variant="secondary">Award points from attendance</SubmitButton>
            </ActionForm>) : null} />
          {(rules ?? []).length === 0 ? <EmptyState title="No point rules yet" /> : (
            <Table>
              <THead><tr><TH>Rule</TH><TH>Category</TH><TH className="text-right">Points</TH><TH>Cap</TH><TH>Status</TH>{s.can("policies.approve") ? <TH /> : null}</tr></THead>
              <TBody>{(rules ?? []).map((r) => (
                <TR key={r.id}><TD>{r.name}<span className="block text-xs text-slate-400">{r.audience}{r.semester_id ? "" : " · every semester"}</span></TD><TD>{r.category_key ?? "manual"}</TD><TD className="tabular text-right">{r.points}</TD><TD>{r.max_awards_per_semester ?? "—"}</TD>
                  <TD><Badge tone={r.status === "approved" ? "green" : r.status === "draft" ? "draft" : "neutral"}>{r.status}</Badge></TD>
                  {s.can("policies.approve") ? <TD>{r.status !== "retired" ? (
                    <ActionForm action={setPointRuleStatus} showMessage={false}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "draft" ? "approved" : "retired"} /><SubmitButton size="sm" variant="ghost">{r.status === "draft" ? "Approve" : "Retire"}</SubmitButton></ActionForm>) : null}</TD> : null}</TR>
              ))}</TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={`Transactions · ${semester.name}`} />
          {tx.length === 0 ? <EmptyState title="No points yet" /> : (
            <Table><THead><tr><TH>When</TH><TH>Person</TH><TH>Activity</TH><TH className="text-right">Points</TH></tr></THead>
              <TBody>{tx.slice(0, 200).map((t) => <TR key={t.id}><TD className="text-xs">{new Date(t.created_at).toLocaleDateString("en-US")}</TD><TD>{displayName(t.people as never)}</TD><TD className="text-xs">{(t.events as { name: string } | null)?.name ?? t.reason}</TD><TD className="tabular text-right">{t.points}</TD></TR>)}</TBody></Table>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        {s.can("points.manage") || s.can("policies.approve") ? (
          <Card><CardHeader title="Draft a point rule" /><CardBody>
            <ActionForm action={savePointRule} className="space-y-3" resetOnSuccess>
              <Field label="Name" htmlFor="rn"><Input id="rn" name="name" required /></Field>
              <Field label="Event category" htmlFor="rc"><Select id="rc" name="category_key"><option value="">Manual awards only</option>{(cats ?? []).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
              <Field label="Points" htmlFor="rp"><Input id="rp" name="points" type="number" required /></Field>
              <Field label="Max awards per semester" htmlFor="rm" hint="Optional cap"><Input id="rm" name="max_awards_per_semester" type="number" min={1} /></Field>
              <Field label="Applies to" htmlFor="ra"><Select id="ra" name="audience"><option value="member">Members</option><option value="prospect">Prospects</option><option value="both">Both</option></Select></Field>
              <Field label="Semester" htmlFor="rsem"><Select id="rsem" name="semester_id"><option value="">Every semester</option><option value={semester.id}>{semester.name} only</option></Select></Field>
              <Textarea name="notes" placeholder="Notes / source of approval" aria-label="Notes" />
              <SubmitButton size="sm">Save draft rule</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        ) : null}
        {s.can("points.award") ? (
          <Card><CardHeader title="Manual adjustment" /><CardBody>
            <ActionForm action={adjustPoints} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="semester_id" value={semester.id} />
              <Field label="Member" htmlFor="ap"><Select id="ap" name="person_id" required defaultValue=""><option value="" disabled>Choose…</option>{people.map((p) => <option key={p.person_id} value={p.person_id!}>{displayName(p)}</option>)}</Select></Field>
              <Field label="Points (+/−)" htmlFor="apt"><Input id="apt" name="points" type="number" required /></Field>
              <Field label="Reason" htmlFor="ar"><Input id="ar" name="reason" required /></Field>
              <SubmitButton size="sm" variant="secondary">Record adjustment</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        ) : null}
      </div>
    </div>
  );
}
