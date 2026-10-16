"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, type CollisionDetection, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarPlus, GripVertical, X } from "lucide-react";
import { formatDate, formatTimeRange } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import { moveEvent } from "./actions";

export type CalEvent = {
  id: string; name: string; event_date: string | null; start_time: string | null; end_time: string | null; time_note: string | null;
  location: string | null; category_key: string | null; category_name: string | null; planning_status: string; notes: string | null;
  attended: number; members: number; series_key: string | null;
};

const CAT: Record<string, string> = {
  meeting: "border-l-brand bg-brand-50", general: "border-l-violet-500 bg-violet-50", service: "border-l-emerald-600 bg-emerald-50",
  mentoring: "border-l-amber-500 bg-amber-50", study: "border-l-slate-400 bg-slate-100", recruitment: "border-l-rose-500 bg-rose-50",
};

// Drop onto the day under the pointer; fall back to overlap (touch/keyboard).
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function Chip({ ev, canEdit, onOpen, overlay = false }: { ev: CalEvent; canEdit: boolean; onOpen: (e: CalEvent) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.id, disabled: !canEdit || overlay });
  const held = ev.attended > 0;
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={cn(
        "group relative rounded-r border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        CAT[ev.category_key ?? ""] ?? "border-l-slate-300 bg-white",
        held && "border-l-emerald-700 bg-emerald-50",
        ev.planning_status === "pending_approval" && "border-dashed outline outline-1 outline-amber-300",
        ev.planning_status === "cancelled" && "opacity-50 line-through",
        isDragging && "opacity-30",
        overlay && "rotate-1 shadow-lg",
      )}
    >
      <button type="button" onClick={() => onOpen(ev)} className="block w-full text-left focus:outline-none" aria-label={`${ev.name}, ${formatDate(ev.event_date)}. Open details`}>
        <span className="block font-semibold uppercase tracking-wide text-[9.5px] text-slate-500">{formatTimeRange(ev.start_time, ev.end_time, ev.time_note)}</span>
        <span className="block font-semibold text-slate-900">{ev.name}</span>
        {ev.location ? <span className="hidden text-slate-500 md:block">{ev.location}</span> : null}
        {held ? <span className="mt-0.5 block text-[9.5px] font-bold uppercase text-emerald-800">✓ {ev.attended} attended · {ev.members} members</span> : null}
        {ev.planning_status === "pending_approval" ? <span className="mt-0.5 block text-[9.5px] font-bold uppercase text-amber-700">Pending</span> : null}
      </button>
      {canEdit && !overlay ? (
        <span {...listeners} {...attributes} aria-label={`Drag ${ev.name} to another day`} className="absolute right-0.5 top-0.5 hidden cursor-grab rounded p-0.5 text-slate-400 hover:bg-white/80 group-hover:block focus:block active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );
}

function DayCell({ date, inMonth, isToday, children, canEdit }: { date: string; inMonth: boolean; isToday: boolean; children: React.ReactNode; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, disabled: !canEdit });
  const day = Number(date.slice(8));
  return (
    <div ref={setNodeRef} className={cn("group/day relative min-h-28 border-b border-r border-slate-200 p-1.5", !inMonth && "bg-slate-50/80", isOver && "bg-brand-50 ring-2 ring-inset ring-brand")}>
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("tabular text-xs font-semibold", inMonth ? "text-slate-700" : "text-slate-400", isToday && "rounded-full bg-brand px-1.5 text-white")}>{day}</span>
        {canEdit ? (
          <Link href={`/events/new?date=${date}`} className="hidden rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand group-hover/day:block" aria-label={`Add event on ${formatDate(date)}`}>
            <CalendarPlus className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Tray({ events, canEdit, onOpen }: { events: CalEvent[]; canEdit: boolean; onOpen: (e: CalEvent) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "tray", disabled: !canEdit });
  return (
    <div ref={setNodeRef} className={cn("rounded-lg border border-dashed border-slate-300 bg-white p-3", isOver && "border-brand bg-brand-50")}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Date TBD ({events.length})</p>
      <p className="mb-2 text-xs text-slate-500">{canEdit ? "Drag an event here to unschedule it, or from here onto a day." : "Events without a date yet."}</p>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
        {events.length ? events.map((e) => <Chip key={e.id} ev={e} canEdit={canEdit} onOpen={onOpen} />) : <p className="text-xs text-slate-400">None</p>}
      </div>
    </div>
  );
}

export function CalendarBoard({ initial, days, month, today, canEdit }: { initial: CalEvent[]; days: string[]; month: string; today: string; canEdit: boolean }) {
  const [events, setEvents] = useState(initial);
  const [active, setActive] = useState<CalEvent | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) if (e.event_date) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]);
    for (const list of m.values()) list.sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
    return m;
  }, [events]);
  const unscheduled = events.filter((e) => !e.event_date);

  const doMove = (id: string, to: string | null) => {
    const ev = events.find((e) => e.id === id);
    if (!ev || ev.event_date === to) return;
    const before = events;
    setEvents((cur) => cur.map((e) => (e.id === id ? { ...e, event_date: to } : e)));
    setOpen((o) => (o && o.id === id ? { ...o, event_date: to } : o));
    start(async () => {
      const res = await moveEvent(id, to);
      if (!res.ok) {
        setEvents(before);
        setMsg({ tone: "err", text: res.error ?? "Could not move the event." });
      } else {
        setMsg({ tone: res.warning ? "warn" : "ok", text: `Moved “${ev.name}” to ${formatDate(to)}.${res.warning ? ` ${res.warning}` : ""} Other officers will see the change on their next load.` });
      }
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    doMove(String(e.active.id), over === "tray" ? null : over.slice(4));
  };

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <DndContext id="chapter-calendar" sensors={sensors} collisionDetection={collision} onDragStart={(e) => setActive(events.find((x) => x.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {msg ? (
        <div role="status" className={cn("mb-3 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm",
          msg.tone === "ok" ? "bg-emerald-50 text-emerald-800" : msg.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800")}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
        {/* Month grid (tablet/desktop) */}
        <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-ink text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
            {weekdays.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
            {days.map((d) => (
              <DayCell key={d} date={d} inMonth={d.startsWith(month)} isToday={d === today} canEdit={canEdit}>
                {(byDay.get(d) ?? []).map((ev) => <Chip key={ev.id} ev={ev} canEdit={canEdit} onOpen={setOpen} />)}
              </DayCell>
            ))}
          </div>
        </div>
        {/* Agenda list (phones) */}
        <ol className="space-y-2 md:hidden">
          {days.filter((d) => d.startsWith(month) && byDay.get(d)?.length).map((d) => (
            <li key={d} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">{formatDate(d, { weekday: "long", month: "short", day: "numeric" })}</p>
              <div className="space-y-1.5">{byDay.get(d)!.map((ev) => <Chip key={ev.id} ev={ev} canEdit={false} onOpen={setOpen} />)}</div>
            </li>
          ))}
          {!days.some((d) => d.startsWith(month) && byDay.get(d)?.length) ? <li className="text-sm text-slate-500">No events this month.</li> : null}
        </ol>
        <div className="space-y-4">
          <Tray events={unscheduled} canEdit={canEdit} onOpen={setOpen} />
          {open ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{open.name}</h3>
                <button onClick={() => setOpen(null)} aria-label="Close details"><X className="h-4 w-4 text-slate-400" /></button>
              </div>
              <dl className="mt-2 space-y-1 text-xs text-slate-600">
                <div><dt className="inline font-medium">When: </dt><dd className="inline">{formatDate(open.event_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {formatTimeRange(open.start_time, open.end_time, open.time_note)}</dd></div>
                <div><dt className="inline font-medium">Where: </dt><dd className="inline">{open.location ?? "TBD"}</dd></div>
                <div><dt className="inline font-medium">Category: </dt><dd className="inline">{open.category_name ?? "None"}</dd></div>
                <div><dt className="inline font-medium">Status: </dt><dd className="inline">{open.planning_status.replace("_", " ")}</dd></div>
                {open.notes ? <div><dt className="inline font-medium">Notes: </dt><dd className="inline">{open.notes}</dd></div> : null}
              </dl>
              {canEdit ? (
                <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("d") as string; doMove(open.id, v || null); }}>
                  <label htmlFor="move-date" className="block text-xs font-medium text-slate-700">Move to date (keyboard-friendly)</label>
                  <div className="flex gap-2">
                    <input id="move-date" name="d" type="date" defaultValue={open.event_date ?? ""} key={open.id + open.event_date} className="h-8 flex-1 rounded-md border border-slate-300 px-2 text-xs" />
                    <button className="h-8 rounded-md bg-brand px-3 text-xs font-medium text-white">Move</button>
                  </div>
                  <p className="text-[11px] text-slate-500">Leave empty to mark the date as TBD.</p>
                </form>
              ) : null}
              <Link href={`/events/${open.id}`} className="mt-3 inline-block text-xs font-medium text-brand hover:underline">Open event →</Link>
            </div>
          ) : null}
        </div>
      </div>
      <DragOverlay>{active ? <div className="w-40"><Chip ev={active} canEdit={false} onOpen={() => {}} overlay /></div> : null}</DragOverlay>
    </DndContext>
  );
}
