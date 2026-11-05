import Link from "next/link";
import { ChevronRight, Flag, Settings2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { loadApplicants, loadCurrentCycle, loadScores, type ApplicantRow } from "@/lib/data/interviews";
import { formatDate, formatDateTimeEastern, todayIso } from "@/lib/domain/dates";
import { APPLICANT_STATUS_LABELS, CYCLE_STATUS_LABELS, RECOMMENDATION_LABELS, interviewTotal, maxEngagement, maxInterviewScore, rankApplicants, type Recommendation } from "@/lib/domain/interviews";
import { PageHeader, EmptyState, StatCard, Callout } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cn } from "@/lib/cn";
import { sp } from "@/lib/url";
import { setDecision } from "./actions";

export const metadata = { title: "Interviews" };

const STATUS_TONE: Record<string, "neutral" | "green" | "red" | "amber" | "blue"> = { scheduled: "blue", completed: "green", no_show: "red", rescheduled: "amber", withdrawn: "neutral" };

export default async function InterviewsPage({ searchParams }: PageProps<"/interviews">) {
  const params = await searchParams;
  const s = await requirePermission("interviews.conduct", "interviews.manage");
  const manage = s.can("interviews.manage");
  const cycle = await loadCurrentCycle(s);
  if (!cycle) {
    return (
      <>
        <PageHeader title="Interviews" />
        <EmptyState title="No intake is set up yet">{manage ? <Link className="text-brand underline" href="/interviews/setup">Set up an intake</Link> : "The coordinator hasn't set one up yet."}</EmptyState>
      </>
    );
  }
  const applicants = await loadApplicants(s, cycle.id);
  const scores = await loadScores(s, applicants.map((a) => a.id));
  const deliberation = cycle.status === "deliberation" || cycle.status === "closed";
  const mineIds = new Set(applicants.filter((a) => a.interviewer_id === s.userId).map((a) => a.id));
  const myScore = new Map(scores.filter((x) => x.interviewer_id === s.userId).map((x) => [x.applicant_id, x]));
  const defaultView = deliberation ? "ranking" : mineIds.size ? "mine" : "all";
  const view = sp(params, "view") ?? defaultView;
  const q = sp(params, "q")?.toLowerCase().trim();

  const counts = {
    completed: applicants.filter((a) => a.status === "completed").length,
    noShow: applicants.filter((a) => a.status === "no_show").length,
    unassigned: applicants.filter((a) => !a.interviewer_id && a.status !== "withdrawn").length,
    active: applicants.filter((a) => a.status !== "withdrawn").length,
  };
  const today = todayIso();
  const myToday = applicants.filter((a) => mineIds.has(a.id) && a.slot_at && formatDateTimeEastern(a.slot_at, { year: "numeric", month: "2-digit", day: "2-digit" }) === `${today.slice(5, 7)}/${today.slice(8, 10)}/${today.slice(0, 4)}`).length;

  const list = applicants
    .filter((a) => view === "mine" ? mineIds.has(a.id) : view === "open" ? !a.interviewer_id && a.status !== "withdrawn" : true)
    .filter((a) => !q || a.name.toLowerCase().includes(q));

  const tabs = [
    ...(deliberation ? [{ key: "ranking", label: "Ranking", n: null as number | null }] : []),
    { key: "mine", label: "Mine", n: mineIds.size },
    { key: "open", label: "Unassigned", n: counts.unassigned },
    { key: "all", label: "All", n: applicants.length },
  ];

  return (
    <>
      <PageHeader title={cycle.name}
        badge={<Badge tone={cycle.status === "interviewing" ? "green" : cycle.status === "deliberation" ? "amber" : "neutral"}>{CYCLE_STATUS_LABELS[cycle.status]}</Badge>}
        description={`${cycle.spots} spots · ${counts.active} applicants${cycle.decisions_by ? ` · decisions by ${formatDate(cycle.decisions_by)}` : ""}`}
        actions={manage ? <LinkButton href="/interviews/setup" size="lg"><Settings2 className="h-4 w-4" /> Intake setup</LinkButton> : null} />

      {cycle.status === "setup" ? <Callout tone="info" className="mb-4">Interviews aren&apos;t open yet. {manage ? "Assign interviewers, then open interviews from Intake setup." : "The coordinator will open them."}</Callout> : null}
      {cycle.status === "interviewing" ? <Callout tone="info" className="mb-4" title="Blind until deliberation">You only see your own scores. Everyone&apos;s scores become visible, and locked, when the board opens deliberation.</Callout> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Completed" value={`${counts.completed} / ${counts.active}`} />
        <StatCard label="Your interviews" value={mineIds.size} hint={myToday ? `${myToday} today` : undefined} />
        <StatCard label="Unassigned" value={counts.unassigned} tone={counts.unassigned && cycle.status === "interviewing" ? "warn" : "default"} />
        <StatCard label="No-shows" value={counts.noShow} />
      </div>

      <nav aria-label="Interview lists" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link key={t.key} href={`/interviews?view=${t.key}`} aria-current={view === t.key ? "page" : undefined}
            className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium", view === t.key ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700")}>
            {t.label}{t.n !== null ? <span className={cn("rounded-full px-1.5 text-xs", view === t.key ? "bg-white/20" : "bg-slate-100")}>{t.n}</span> : null}
          </Link>
        ))}
      </nav>

      {view === "ranking" && deliberation ? <Ranking cycle={cycle} applicants={applicants} scores={scores} manage={manage} s={s} /> : (
        <>
          <form role="search" className="mb-3">
            <input type="hidden" name="view" value={view} />
            <label className="sr-only" htmlFor="iq">Find an applicant</label>
            <Input id="iq" name="q" defaultValue={sp(params, "q")} placeholder="Find an applicant" className="h-11 text-base" />
          </form>
          {list.length === 0 ? (
            <EmptyState title={view === "mine" ? "You have no interviews assigned" : "Nobody here"}>{view === "mine" && counts.unassigned ? <Link className="text-brand underline" href="/interviews?view=open">See unassigned interviews</Link> : null}</EmptyState>
          ) : (
            <ul className="space-y-2">
              {list.map((a) => <ApplicantCard key={a.id} a={a} mine={mineIds.has(a.id)} score={myScore.get(a.id) ?? null} />)}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function ApplicantCard({ a, mine, score }: { a: ApplicantRow; mine: boolean; score: { submitted_at: string | null } | null }) {
  return (
    <li>
      <Link href={`/interviews/${a.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm active:bg-slate-50 hover:border-brand">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{a.name}</p>
          <p className="truncate text-sm text-slate-500">
            {a.slot_at ? formatDateTimeEastern(a.slot_at) : "No time set"} · {mine ? "You" : a.interviewer_name ?? "Unassigned"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[a.status]}>{APPLICANT_STATUS_LABELS[a.status]}</Badge>
            {a.group_label ? <Badge tone="neutral">{a.group_label}</Badge> : null}
            {mine && score ? <Badge tone={score.submitted_at ? "green" : "amber"}>{score.submitted_at ? "Scored" : "Draft"}</Badge> : null}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </Link>
    </li>
  );
}

async function Ranking({ cycle, applicants, scores, manage, s }: {
  cycle: NonNullable<Awaited<ReturnType<typeof loadCurrentCycle>>>; applicants: ApplicantRow[]; scores: Awaited<ReturnType<typeof loadScores>>; manage: boolean;
  s: Awaited<ReturnType<typeof requirePermission>>;
}) {
  const cfg = cycle.config;
  // Service events attended (second tie-breaker), counted up to the same cutoff as engagement.
  const ids = applicants.map((a) => a.person_id);
  const service = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await fetchAll((f, t) => {
      let q = s.supabase.from("v_attendance_detail").select("person_id, event_id").in("person_id", ids.slice(i, i + 200)).eq("effective_category", "service").eq("counts_as_attended", true);
      if (cycle.engagement_cutoff) q = q.lte("event_date", cycle.engagement_cutoff);
      return q.order("id").range(f, t);
    });
    const seen = new Set<string>();
    for (const r of rows) { const k = `${r.person_id}|${r.event_id}`; if (!seen.has(k)) { seen.add(k); service.set(r.person_id!, (service.get(r.person_id!) ?? 0) + 1); } }
  }
  const scoreFor = (a: ApplicantRow) => scores.find((x) => x.applicant_id === a.id && x.interviewer_id === a.interviewer_id && x.submitted_at) ?? scores.find((x) => x.applicant_id === a.id && x.submitted_at) ?? null;
  const active = applicants.filter((a) => a.status !== "withdrawn");
  const ranked = rankApplicants(active.map((a) => {
    const sc = scoreFor(a);
    return { ...a, sc, total: sc ? interviewTotal(sc.scores, cfg) : null, engagement: a.engagement_points ?? 0, events: a.engagement_events ?? 0, serviceEvents: service.get(a.person_id) ?? 0 };
  }));
  const flagged = ranked.filter((r) => r.sc?.red_flag);
  const offers = applicants.filter((a) => a.decision === "offer").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Offers marked" value={`${offers} / ${cycle.spots}`} />
        <StatCard label="Waitlisted" value={applicants.filter((a) => a.decision === "waitlist").length} />
        <StatCard label="Red flags" value={flagged.length} tone={flagged.length ? "warn" : "default"} />
        <StatCard label="Not scored" value={ranked.filter((r) => r.rank === null).length} />
      </div>
      <p className="text-sm text-slate-600">Composite = interview (/{maxInterviewScore(cfg)}) + engagement (/{maxEngagement(cfg)}). Ties break on events attended, then service events. The line marks spot {cycle.spots}; it&apos;s a starting point, not the decision.{cfg.tie_breakers.length ? ` Board tie-breakers: ${cfg.tie_breakers.join(" → ")}.` : ""}</p>
      <ol className="space-y-2">
        {ranked.map((r) => (
          <li key={r.id}>
            {r.rank === cycle.spots + 1 ? <div className="my-3 border-t-4 border-double border-red-500 pt-1 text-center text-xs font-semibold uppercase tracking-wide text-red-700">Cut line · {cycle.spots} spots</div> : null}
            <div className={cn("rounded-xl border bg-white px-4 py-3 shadow-sm", r.rank !== null && r.rank <= cycle.spots ? "border-emerald-200" : "border-slate-200")}>
              <div className="flex items-start gap-3">
                <span className="w-8 shrink-0 text-lg font-bold tabular-nums text-slate-400">{r.rank ?? "–"}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/interviews/${r.id}`} className="block truncate text-base font-semibold text-ink hover:text-brand">{r.name}</Link>
                  <p className="text-sm text-slate-600 tabular-nums">{r.composite ?? "–"} composite · {r.total ?? "–"} interview · {r.engagement} engagement · {r.events} events</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.sc?.recommendation ? <Badge tone="blue">{RECOMMENDATION_LABELS[r.sc.recommendation as Recommendation]}</Badge> : null}
                    {r.sc?.red_flag ? <Badge tone="red"><Flag className="h-3 w-3" /> Red flag</Badge> : null}
                    {r.decision ? <Badge tone={r.decision === "offer" ? "green" : r.decision === "waitlist" ? "amber" : "neutral"}>{r.decision === "offer" ? "Offer" : r.decision === "waitlist" ? `Waitlist${r.waitlist_rank ? ` #${r.waitlist_rank}` : ""}` : "Decline"}</Badge> : null}
                    {r.status === "no_show" ? <Badge tone="red">No-show</Badge> : null}
                  </div>
                </div>
              </div>
              {manage ? (
                <ActionForm action={setDecision} className="mt-3 flex flex-wrap items-center gap-2" showMessage={false}>
                  <input type="hidden" name="id" value={r.id} />
                  <Select name="decision" defaultValue={r.decision ?? ""} aria-label={`Decision for ${r.name}`} className="h-11 w-36"><option value="">No decision</option><option value="offer">Offer</option><option value="waitlist">Waitlist</option><option value="decline">Decline</option></Select>
                  <Input name="waitlist_rank" type="number" min={1} defaultValue={r.waitlist_rank ?? ""} placeholder="Waitlist #" aria-label="Waitlist position" className="h-11 w-28" />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
