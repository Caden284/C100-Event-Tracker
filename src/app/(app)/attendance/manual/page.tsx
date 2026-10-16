import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { attendanceCountsByEvent } from "@/lib/data/events";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Manual attendance" };

export default async function ManualAttendance() {
  const s = await requirePermission("attendance.write");
  const { current } = await resolveSemester(s.supabase);
  const today = todayIso();
  const { data: events } = await s.supabase.from("events").select("id, name, event_date, attendance_source, category_key")
    .eq("semester_id", current?.id ?? "").is("archived_at", null).lte("event_date", today).order("event_date", { ascending: false });
  const counts = await attendanceCountsByEvent(s, (events ?? []).map((e) => e.id));
  return (
    <>
      <PageHeader title="Manual attendance" back={{ href: "/attendance", label: "Attendance" }} description="Choose the event, then tick names from the paper sign-in sheet, add walk-ins, or correct a record." />
      <Card>
        <CardHeader title="Past events this semester" />
        <Table>
          <THead><tr><TH>Date</TH><TH>Event</TH><TH>Source</TH><TH className="text-right">Records</TH><TH /></tr></THead>
          <TBody>
            {(events ?? []).map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap">{formatDate(e.event_date)}</TD>
                <TD className="font-medium text-ink">{e.name}</TD>
                <TD className="text-xs">{e.attendance_source}</TD>
                <TD className="tabular text-right">{counts.get(e.id)?.records ?? 0}</TD>
                <TD className="text-right"><Link href={`/events/${e.id}#quick-entry`} className="text-xs font-medium text-brand hover:underline">Enter attendance →</Link></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
