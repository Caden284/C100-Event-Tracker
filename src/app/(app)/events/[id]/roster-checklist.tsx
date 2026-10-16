"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input, Select } from "@/components/ui/form";
import { bulkAttendance } from "../actions";

export type RosterPerson = { person_id: string; name: string; email: string | null; type: "member" | "prospect"; recorded: string | null };

/** Quick entry from a paper sign-in sheet: search, tick, save. */
export function RosterChecklist({ eventId, people, statuses }: { eventId: string; people: RosterPerson[]; statuses: { key: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [who, setWho] = useState<"all" | "member" | "prospect">("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter((p) => (who === "all" || p.type === who) && (!t || p.name.toLowerCase().includes(t) || (p.email ?? "").includes(t)));
  }, [people, q, who]);
  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <ActionForm action={bulkAttendance} onSuccess={() => setChecked(new Set())} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      {[...checked].map((id) => <input key={id} type="hidden" name="person_id" value={id} />)}
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="rc-q">Search people</label>
        <Input id="rc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or email from the sheet…" className="h-8 min-w-56 flex-1 text-xs" />
        <label className="sr-only" htmlFor="rc-who">Show</label>
        <Select id="rc-who" value={who} onChange={(e) => setWho(e.target.value as typeof who)} className="h-8 w-36 text-xs">
          <option value="all">Members & prospects</option>
          <option value="member">Members</option>
          <option value="prospect">Prospects</option>
        </Select>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
        <ul className="divide-y divide-slate-100 text-sm">
          {list.slice(0, 300).map((p) => (
            <li key={p.person_id}>
              <label className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 ${p.recorded ? "bg-slate-50 text-slate-400" : "hover:bg-brand-50/40"}`}>
                <input type="checkbox" className="h-4 w-4" disabled={!!p.recorded} checked={checked.has(p.person_id) || !!p.recorded} onChange={() => toggle(p.person_id)} />
                <span className="flex-1">{p.name} <span className="text-xs text-slate-400">{p.email ?? "no email"}</span></span>
                <span className="text-xs text-slate-400">{p.recorded ? `already ${p.recorded}` : p.type}</span>
              </label>
            </li>
          ))}
          {list.length === 0 ? <li className="px-3 py-4 text-center text-xs text-slate-500">No one matches. Use “Add a walk-in” below.</li> : null}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="rc-status">Status</label>
        <Select id="rc-status" name="status_key" className="h-8 w-40 text-xs" defaultValue="attended">
          {statuses.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </Select>
        <Input name="reason" placeholder="Source note (default: Paper sign-in)" className="h-8 w-64 text-xs" />
        <SubmitButton size="sm" disabled={checked.size === 0}>Record {checked.size || ""} selected</SubmitButton>
      </div>
    </ActionForm>
  );
}
