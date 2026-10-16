import Link from "next/link";
import { requireOfficer } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Settings" };

export default async function SettingsHome() {
  const s = await requireOfficer();
  const items = [
    { href: "/settings/semesters", title: "Semesters & rollover", body: "Academic years, dates, dues deadlines, policy per semester, and end-of-semester rollover.", ok: s.can("semesters.manage") },
    { href: "/settings/policies", title: "Membership policies", body: "Attendance requirements, standing rules and strike thresholds — drafted, approved and versioned.", ok: s.can("policies.read") },
    { href: "/settings/categories", title: "Categories & statuses", body: "Event categories, membership statuses and attendance statuses.", ok: s.can("settings.manage") },
    { href: "/settings/app", title: "Indicators & limits", body: "Prospect interest thresholds, behind-pace warnings, upload limits.", ok: s.can("settings.manage") },
    { href: "/settings/users", title: "Users & roles", body: "Invite executive board officers, assign roles, and configure role permissions.", ok: s.can("users.manage") },
    { href: "/settings/notifications", title: "Notifications", body: "Which roles receive which in-app alerts.", ok: s.can("users.manage") },
    { href: "/settings/migration", title: "Workbook migration", body: "Import C100_Membership_Tracker.xlsx safely (repeatable, with rollback).", ok: s.can("data.migrate") },
    { href: "/settings/backup", title: "Backup & restore", body: "Download a full backup, verify it, and restore.", ok: s.can("backup.manage") },
  ].filter((i) => i.ok);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand">
            <p className="font-semibold text-ink">{i.title}</p><p className="mt-1 text-sm text-slate-600">{i.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
