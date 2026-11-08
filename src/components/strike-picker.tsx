"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/form";

export type PickerMember = { id: string; name: string; email: string | null; status: string; strikes: number; flagged: boolean };

/**
 * Searchable checkbox list of members for recording one strike for several people.
 * Selected members stay selected (and submitted) while the search hides others.
 */
export function StrikePicker({ members }: { members: PickerMember[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Clear the selection when the surrounding form resets after a successful save.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const onReset = () => { setPicked(new Set()); setQ(""); };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const needle = q.trim().toLowerCase();
  const visible = useMemo(
    () => members.filter((m) => (!onlyFlagged || m.flagged) && (!needle || m.name.toLowerCase().includes(needle) || (m.email ?? "").toLowerCase().includes(needle))),
    [members, needle, onlyFlagged],
  );
  const toggle = (id: string, on: boolean) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const allVisible = visible.length > 0 && visible.every((m) => picked.has(m.id));
  const chosen = members.filter((m) => picked.has(m.id));

  return (
    <div ref={root} className="space-y-3">
      {[...picked].map((id) => <input key={id} type="hidden" name="member_id" value={id} />)}
      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search members" className="h-10 w-full sm:w-64" />
        <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />Only members needing attention</label>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" checked={allVisible} onChange={(e) => { const on = e.target.checked; setPicked((prev) => { const next = new Set(prev); for (const m of visible) { if (on) next.add(m.id); else next.delete(m.id); } return next; }); }} />
          Select all shown
        </label>
      </div>
      <p className="text-sm text-slate-600" aria-live="polite">
        <strong>{chosen.length}</strong> selected{chosen.length ? `: ${chosen.slice(0, 6).map((m) => m.name).join(", ")}${chosen.length > 6 ? ` and ${chosen.length - 6} more` : ""}` : ""}
        {chosen.length ? <button type="button" className="ml-2 text-xs font-medium text-brand hover:underline" onClick={() => setPicked(new Set())}>Clear</button> : null}
      </p>
      <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 bg-white">
        {visible.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-500">No members match.</li> : visible.map((m) => (
          <li key={m.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={picked.has(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} aria-label={`Select ${m.name}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                <span className="block truncate text-xs text-slate-500">{m.email ?? "no email"} · {m.status.replace(/_/g, " ")}{m.flagged ? " · needs attention" : ""}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular ${m.strikes >= 2 ? "bg-red-50 text-red-700" : m.strikes === 1 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                {m.strikes} strike{m.strikes === 1 ? "" : "s"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
