import { requirePermission } from "@/lib/auth";
import { formatDate, formatTimeRange } from "@/lib/domain/dates";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Printable calendar" };

export default async function PrintCalendar({ searchParams }: PageProps<"/calendar/print">) {
  const m = (await searchParams).month;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : new Date().toISOString().slice(0, 7);
  const s = await requirePermission("events.read");
  const [y, mo] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const { data } = await s.supabase.from("events").select("id, name, event_date, start_time, end_time, time_note, location, category_key, planning_status")
    .gte("event_date", `${month}-01`).lte("event_date", end).is("archived_at", null).neq("planning_status", "cancelled").order("event_date").order("start_time");
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="print-full mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm">
      <div className="no-print mb-4 flex justify-between text-sm"><a href={`/calendar?month=${month}`} className="text-brand underline">← Calendar</a><PrintButton /></div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Collegiate 100 · Georgia State University</p>
      <h1 className="text-2xl font-semibold">{label}</h1>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-b border-slate-200 align-top">
              <td className="w-32 py-2 font-medium">{formatDate(e.event_date, { weekday: "short", month: "short", day: "numeric" })}</td>
              <td className="py-2"><span className="font-medium">{e.name}</span>{e.planning_status === "pending_approval" ? " (pending)" : ""}<span className="block text-xs text-slate-500">{formatTimeRange(e.start_time, e.end_time, e.time_note)} · {e.location ?? "Location TBD"}</span></td>
              <td className="w-24 py-2 text-xs capitalize text-slate-500">{e.category_key}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
