"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { clockSegment, fillScript, interviewTotal, isComplete, maxInterviewScore, type IntakeConfig, type Recommendation } from "@/lib/domain/interviews";
import { saveInterview, type InterviewDraft } from "../actions";

type Props = {
  applicantId: string;
  userId: string;
  config: IntakeConfig;
  placeholders: Record<string, string | null>;
  initial: InterviewDraft;
  initialSavedAt: string | null;
  initialSubmittedAt: string | null;
  locked: boolean;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const LOCAL_KEY = (userId: string, id: string) => `c100-interview:${userId}:${id}`;

export function InterviewSheet({ applicantId, userId, config, placeholders, initial, initialSavedAt, initialSubmittedAt, locked }: Props) {
  const [draft, setDraft] = useState<InterviewDraft>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [submittedAt, setSubmittedAt] = useState<string | null>(initialSubmittedAt);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const key = LOCAL_KEY(userId, applicantId);

  // Restore a newer copy kept on this phone (e.g. the connection dropped mid-interview).
  useEffect(() => {
    if (locked) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const local = JSON.parse(raw) as { draft: InterviewDraft; at: string };
      if (!initialSavedAt || local.at > initialSavedAt) {
        draftRef.current = local.draft;
        queueMicrotask(() => { setDraft(local.draft); setState("dirty"); });
      }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (submit = false) => {
    if (locked) return false;
    if (inFlight.current && !submit) return false;
    inFlight.current = true;
    setState("saving");
    const res = await saveInterview(applicantId, draftRef.current, submit).catch(() => ({ ok: false as const, error: "No connection. Your notes are kept on this phone and will save when you're back online." }));
    inFlight.current = false;
    if (res.ok) {
      setSavedAt(res.savedAt); setSubmittedAt(res.submittedAt); setError(null); setState("saved");
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      return true;
    }
    setError(res.error); setState("error");
    return false;
  }, [applicantId, key, locked]);

  const update = useCallback((patch: Partial<InterviewDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      draftRef.current = next;
      try { localStorage.setItem(key, JSON.stringify({ draft: next, at: new Date().toISOString() })); } catch { /* ignore */ }
      return next;
    });
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(false); }, 1200);
  }, [key, save]);

  // Save when the phone locks or the tab is hidden, and retry when back online.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden" && state === "dirty") void save(false); };
    const online = () => { if (state === "dirty" || state === "error") void save(false); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", online);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("online", online); };
  }, [save, state]);

  const total = interviewTotal(draft.scores as Record<string, number>, config);
  const complete = isComplete(draft.scores as Record<string, number>, draft.recommendation, config);
  const missing = useMemo(() => [
    ...config.rubric.filter((c) => typeof draft.scores[c.key] !== "number").map((c) => c.label),
    ...(draft.recommendation ? [] : ["Recommendation"]),
  ], [config.rubric, draft]);

  const fill = (line: string) => fillScript(line, placeholders);

  return (
    <div className="pb-28">
      <Timer config={config} storageKey={`${key}:timer`} />

      {locked ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Scores are locked{submittedAt ? "" : " and this sheet was never submitted"}. Deliberation has started, so nothing here can change.
        </div>
      ) : null}

      <fieldset disabled={locked} className="space-y-4">
        {config.before_call.length ? (
          <Section title="Before the call" defaultOpen={false}>
            <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700">{config.before_call.map((l) => <li key={l}>{fill(l)}</li>)}</ul>
          </Section>
        ) : null}

        {config.opening.length ? (
          <Section title="Read this aloud, every time" defaultOpen>
            <div className="space-y-2.5">{config.opening.map((l) => <p key={l} className="border-l-4 border-ink pl-3 text-[15px] leading-relaxed text-slate-800">{fill(l)}</p>)}</div>
          </Section>
        ) : null}

        <Section title="Questions" defaultOpen>
          <ol className="space-y-5">
            {config.questions.map((q, i) => (
              <li key={q.key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Q{i + 1} · {q.label}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink">{q.text}</p>
                {q.look_for ? <p className="mt-1 text-sm italic text-slate-500">Listening for: {q.look_for}</p> : null}
                <label className="sr-only" htmlFor={`ans-${q.key}`}>Notes for Q{i + 1}</label>
                <textarea id={`ans-${q.key}`} rows={3} value={draft.answers[q.key] ?? ""} onChange={(e) => update({ answers: { ...draft.answers, [q.key]: e.target.value } })}
                  placeholder="Notes" className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] leading-snug focus:border-brand" />
              </li>
            ))}
            <li>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Q{config.questions.length + 1} · Your own question</p>
              {config.own_question ? <p className="mt-1 text-sm text-slate-500">{config.own_question}</p> : null}
              <label className="sr-only" htmlFor="own-q">Your question</label>
              <input id="own-q" value={draft.own_question} onChange={(e) => update({ own_question: e.target.value })} placeholder="The question you asked"
                className="mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] focus:border-brand" />
              <label className="sr-only" htmlFor="own-n">Notes for your question</label>
              <textarea id="own-n" rows={3} value={draft.own_notes} onChange={(e) => update({ own_notes: e.target.value })} placeholder="Notes"
                className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] focus:border-brand" />
            </li>
          </ol>
        </Section>

        <Section title={`Scores${total !== null ? ` · ${total} / ${maxInterviewScore(config)}` : ""}`} defaultOpen>
          <p className="mb-3 text-sm text-slate-500">Score within five minutes of hanging up. Tap a number; the guide for 5, 3 and 1 is under each.</p>
          <div className="space-y-5">
            {config.rubric.map((c) => {
              const v = draft.scores[c.key] ?? null;
              const miss = showMissing && v === null;
              return (
                <div key={c.key} className={cn("rounded-lg", miss && "ring-2 ring-red-300 ring-offset-4")}>
                  <p id={`crit-${c.key}`} className="text-[15px] font-semibold text-ink">{c.label} {c.questions ? <span className="text-xs font-medium text-gold-700">{c.questions}</span> : null}</p>
                  <div role="radiogroup" aria-labelledby={`crit-${c.key}`} className="mt-2 grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={v === n} onClick={() => update({ scores: { ...draft.scores, [c.key]: v === n ? null : n } })}
                        className={cn("h-12 rounded-lg border text-lg font-semibold transition-colors", v === n ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 active:bg-slate-100")}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {c.anchors["5"] || c.anchors["3"] || c.anchors["1"] ? (
                    <dl className="mt-2 grid gap-1 text-[13px] leading-snug text-slate-600 sm:grid-cols-3">
                      {(["5", "3", "1"] as const).map((k) => c.anchors[k] ? (
                        <div key={k} className={cn("rounded-md px-2 py-1", v === Number(k) ? "bg-brand-50 text-brand-700" : "bg-slate-50")}><dt className="inline font-semibold">{k}: </dt><dd className="inline">{c.anchors[k]}</dd></div>
                      ) : null)}
                    </dl>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Recommendation" defaultOpen>
          <div role="radiogroup" aria-label="Recommendation" className={cn("grid grid-cols-2 gap-2", showMissing && !draft.recommendation && "rounded-lg ring-2 ring-red-300 ring-offset-4")}>
            {config.recommendations.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={draft.recommendation === r.key}
                onClick={() => update({ recommendation: draft.recommendation === r.key ? null : r.key as Recommendation })}
                className={cn("min-h-12 rounded-lg border px-3 py-2 text-left text-[15px] font-semibold", draft.recommendation === r.key ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-800 active:bg-slate-100")}>
                {r.label}
                {r.help ? <span className={cn("mt-0.5 block text-xs font-normal", draft.recommendation === r.key ? "text-brand-100" : "text-slate-500")}>{r.help}</span> : null}
              </button>
            ))}
          </div>
          <label className="mt-4 flex min-h-12 items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-[15px] text-red-800">
            <input type="checkbox" checked={draft.red_flag} onChange={(e) => update({ red_flag: e.target.checked })} className="mt-0.5 h-5 w-5 accent-red-600" />
            <span><span className="font-semibold">Red flag</span>, raise at deliberation regardless of score{config.red_flag_help ? <span className="block text-sm text-red-700/80">{config.red_flag_help}</span> : null}</span>
          </label>
          {draft.red_flag ? (
            <textarea rows={2} value={draft.red_flag_note} onChange={(e) => update({ red_flag_note: e.target.value })} placeholder="What the board needs to hear" aria-label="Red flag note"
              className="mt-2 block w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-[15px]" />
          ) : null}
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="gen-notes">Anything else the room should hear</label>
          <textarea id="gen-notes" rows={3} value={draft.notes} onChange={(e) => update({ notes: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px]" />
          {config.volunteered_note ? <p className="mt-2 text-xs text-slate-500">{config.volunteered_note}</p> : null}
        </Section>

        {config.closing.length ? (
          <Section title="Closing" defaultOpen={false}>
            <div className="space-y-2.5">{config.closing.map((l) => <p key={l} className="border-l-4 border-ink pl-3 text-[15px] leading-relaxed text-slate-800">{fill(l)}</p>)}</div>
          </Section>
        ) : null}

        {config.do_not_ask.length ? (
          <Section title="What you cannot ask" defaultOpen={false}>
            <ul className="list-disc space-y-1 pl-5 text-[15px] text-slate-700">{config.do_not_ask.map((l) => <li key={l}>{l}</li>)}</ul>
            {config.also.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{config.also.map((l) => <li key={l}>{l}</li>)}</ul> : null}
          </Section>
        ) : null}
      </fieldset>

      {!locked ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink tabular-nums">{total ?? "–"} / {maxInterviewScore(config)}{draft.red_flag ? <span className="ml-2 text-red-700">· red flag</span> : null}</p>
              <SaveStatus state={state} savedAt={savedAt} submittedAt={submittedAt} error={error} />
            </div>
            <button type="button" disabled={state === "saving"}
              onClick={async () => {
                if (!complete) { setShowMissing(true); setError(`Still needed: ${missing.join(", ")}.`); setState("error"); return; }
                if (timer.current) clearTimeout(timer.current);
                await save(true);
              }}
              className="h-12 shrink-0 rounded-lg bg-brand px-5 text-[15px] font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60">
              {submittedAt ? "Update" : "Submit"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-base font-semibold text-ink">
        {title}<span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}

function SaveStatus({ state, savedAt, submittedAt, error }: { state: SaveState; savedAt: string | null; submittedAt: string | null; error: string | null }) {
  const t = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (state === "saving") return <p className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>;
  if (state === "error") return <p role="alert" className="flex items-center gap-1 text-xs text-red-700"><CloudOff className="h-3 w-3 shrink-0" /> <span className="truncate">{error}</span></p>;
  if (state === "dirty") return <p className="text-xs text-slate-500">Unsaved changes</p>;
  if (submittedAt) return <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Submitted {t(submittedAt)}. You can edit until deliberation.</p>;
  if (savedAt) return <p className="text-xs text-slate-500">Draft saved {t(savedAt)}</p>;
  return <p className="text-xs text-slate-500">Saves automatically as you go</p>;
}

/** 15-minute interview clock that follows the packet's segments; survives a page refresh. */
function Timer({ config, storageKey }: { config: IntakeConfig; storageKey: string }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) { const v = JSON.parse(raw) as { s: number | null; p: number | null }; queueMicrotask(() => { setStartedAt(v.s); setPausedAt(v.p); }); }
    } catch { /* ignore */ }
  }, [storageKey]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ s: startedAt, p: pausedAt })); } catch { /* ignore */ }
  }, [storageKey, startedAt, pausedAt]);
  useEffect(() => {
    if (startedAt === null || pausedAt !== null) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [startedAt, pausedAt]);

  const end = config.clock.length ? config.clock[config.clock.length - 1].to : 15 * 60;
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor(((pausedAt ?? now) - startedAt) / 1000));
  const seg = clockSegment(config, elapsed);
  const over = elapsed >= end;
  const warn = !over && end - elapsed <= 120 && startedAt !== null;
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  const running = startedAt !== null && pausedAt === null;

  return (
    <div className={cn("sticky top-[57px] z-20 -mx-4 mb-4 flex items-center gap-3 border-b px-4 py-2 sm:mx-0 sm:rounded-xl sm:border",
      over ? "border-red-200 bg-red-50" : warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white/95 backdrop-blur")}>
      <span className={cn("text-2xl font-bold tabular-nums", over ? "text-red-700" : warn ? "text-amber-800" : "text-ink")} aria-live="off">{mmss(elapsed)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
        {startedAt === null ? `${mmss(end)} interview` : over ? <span className="flex items-center gap-1 font-semibold text-red-700"><AlertTriangle className="h-4 w-4" /> Time. Close and score.</span> : seg ? <>{seg.label} <span className="text-slate-400">· {mmss(seg.remaining)} left</span></> : null}
      </span>
      <button type="button" aria-label={running ? "Pause timer" : "Start timer"}
        onClick={() => {
          if (startedAt === null) { setStartedAt(Date.now()); setPausedAt(null); setNow(Date.now()); }
          else if (pausedAt === null) setPausedAt(Date.now());
          else { setStartedAt(startedAt + (Date.now() - pausedAt)); setPausedAt(null); setNow(Date.now()); }
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white active:bg-ink-2">
        {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      {startedAt !== null ? (
        <button type="button" aria-label="Reset timer" onClick={() => { setStartedAt(null); setPausedAt(null); }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600">
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
