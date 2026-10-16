import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { fetchAll } from "@/lib/data/fetch-all";
import { formatDate, formatTimeRange } from "@/lib/domain/dates";
import { displayName } from "@/lib/domain/normalize";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Sign-in sheet" };

export default async function PrintSheet({ params, searchParams }: PageProps<"/events/[id]/print">) {
  const { id } = await params;
  const blankOnly = (await searchParams).blank === "1";
  const s = await requirePermission("events.read");
  const { data: ev } = await s.supabase.from("events").select("name, event_date, start_time, end_time, time_note, location").eq("id", id).maybeSingle();
  if (!ev) notFound();
  const members = blankOnly || !s.can("members.read") ? [] : await fetchAll((from, to) =>
    s.supabase.from("v_people_directory").select("person_id, first_name, last_name, preferred_name, status_key").not("member_id", "is", null).in("status_key", ["active", "not_verified"]).order("last_name").order("person_id").range(from, to));
  return (
    <div className="print-full mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm">
      <div className="no-print mb-4 flex justify-between gap-2 text-sm">
        <a href={`/events/${id}`} className="text-brand underline">← Back to event</a>
        <div className="flex gap-3"><a className="text-brand underline" href={blankOnly ? "?" : "?blank=1"}>{blankOnly ? "Include member roster" : "Blank sheet only"}</a><PrintButton /></div>
      </div>
      <h1 className="text-xl font-semibold">{ev.name} — Sign-in sheet</h1>
      <p className="text-sm text-slate-600">Collegiate 100 at Georgia State University · {formatDate(ev.event_date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {formatTimeRange(ev.start_time, ev.end_time, ev.time_note)} · {ev.location ?? ""}</p>
      <p className="mt-1 text-xs text-slate-500">Please print clearly and include your GSU email so attendance can be matched.</p>
      {members.length ? (
        <>
          <h2 className="mt-5 text-sm font-semibold">Members — tick your name</h2>
          <ul className="mt-2 columns-2 gap-6 text-sm">
            {members.map((m) => <li key={m.person_id} className="flex break-inside-avoid items-center gap-2 border-b border-slate-200 py-1"><span className="inline-block h-3.5 w-3.5 border border-slate-500" />{displayName(m)}</li>)}
          </ul>
        </>
      ) : null}
      <h2 className="mt-6 text-sm font-semibold">Guests & anyone not listed</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead><tr className="text-left text-xs text-slate-500"><th className="w-8 border-b py-1">#</th><th className="border-b py-1">Full name</th><th className="border-b py-1">GSU email</th></tr></thead>
        <tbody>{Array.from({ length: blankOnly ? 30 : 15 }).map((_, i) => <tr key={i}><td className="h-8 border-b text-xs text-slate-400">{i + 1}</td><td className="border-b" /><td className="border-b" /></tr>)}</tbody>
      </table>
    </div>
  );
}
