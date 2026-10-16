import Link from "next/link";
import { requireOfficer } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { addDays, formatDate, todayIso } from "@/lib/domain/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { markRead } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const s = await requireOfficer();
  const { current } = await resolveSemester(s.supabase);
  const today = todayIso();
  const [{ data: items }, counts, missing, upcoming, openPeriods] = await Promise.all([
    s.supabase.from("notifications").select("*").eq("recipient_id", s.userId).order("updated_at", { ascending: false }).limit(100),
    s.supabase.rpc("open_review_counts"),
    s.can("members.read") ? s.supabase.from("v_people_directory").select("person_id", { count: "exact", head: true }).not("member_id", "is", null).is("email", null).in("status_key", ["active", "not_verified"]) : Promise.resolve({ count: 0 }),
    s.can("events.read") ? s.supabase.from("events").select("id, name, event_date").gte("event_date", today).lte("event_date", addDays(today, 7)).is("archived_at", null).order("event_date") : Promise.resolve({ data: [] }),
    s.can("recognition.read") ? s.supabase.from("recognition_periods").select("id, name, status").in("status", ["nominations_open", "voting_open"]) : Promise.resolve({ data: [] }),
  ]);
  const c = (counts.data ?? {}) as Record<string, number>;
  const live = [
    s.can("attendance.import") && c.imports_in_preview ? { text: `${c.imports_in_preview} attendance import(s) awaiting review`, href: "/attendance" } : null,
    s.can("attendance.read") && c.unmatched_open ? { text: `${c.unmatched_open} unmatched scan(s) to resolve`, href: "/attendance/unmatched" } : null,
    missing.count ? { text: `${missing.count} member(s) missing an email`, href: "/members?standing=no_email" } : null,
    s.can("policies.approve") && c.policies_awaiting_approval ? { text: `${c.policies_awaiting_approval} policy draft(s) awaiting approval`, href: "/settings/policies" } : null,
    s.can("discipline.approve") && c.discipline_proposed ? { text: `${c.discipline_proposed} disciplinary proposal(s) to review`, href: "/standing?view=actions" } : null,
    ...(openPeriods.data ?? []).map((p) => ({ text: `${p.name}: ${p.status === "voting_open" ? "voting" : "nominations"} open`, href: `/recognition/${p.id}` })),
    ...(upcoming.data ?? []).map((e) => ({ text: `Upcoming: ${e.name} on ${formatDate(e.event_date, { weekday: "short", month: "short", day: "numeric" })}`, href: `/events/${e.id}` })),
  ].filter(Boolean) as { text: string; href: string }[];
  return (
    <>
      <PageHeader title="Notifications" description={`In-app alerts for your roles${current ? ` · ${current.name}` : ""}. No emails are sent.`}
        actions={(items ?? []).some((i) => !i.read_at) ? <ActionForm action={markRead} showMessage={false}><SubmitButton size="sm" variant="secondary">Mark all read</SubmitButton></ActionForm> : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Needs attention now" description="Calculated live from current data" />
          <CardBody className="p-0">{live.length === 0 ? <EmptyState title="All clear" /> : <ul className="divide-y divide-slate-100">{live.map((l) => <li key={l.text}><Link href={l.href} className="block px-5 py-3 text-sm hover:bg-slate-50">{l.text}</Link></li>)}</ul>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Inbox" />
          <CardBody className="p-0">
            {(items ?? []).length === 0 ? <EmptyState title="No notifications" /> : (
              <ul className="divide-y divide-slate-100">{(items ?? []).map((n) => (
                <li key={n.id} className={`flex items-start justify-between gap-3 px-5 py-3 ${n.read_at ? "" : "bg-brand-50/40"}`}>
                  <div><p className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:text-brand">{n.title}</Link> : n.title}{n.occurrences > 1 ? <span className="ml-1 text-xs text-slate-500">×{n.occurrences}</span> : null}</p>{n.body ? <p className="text-xs text-slate-600">{n.body}</p> : null}<p className="text-xs text-slate-400">{new Date(n.updated_at).toLocaleString("en-US")}</p></div>
                  {!n.read_at ? <ActionForm action={markRead} showMessage={false}><input type="hidden" name="id" value={n.id} /><SubmitButton size="sm" variant="ghost">Mark read</SubmitButton></ActionForm> : null}
                </li>
              ))}</ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
