import type { Permission } from "@/lib/auth";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

const ITEMS: { href: string; label: string; icon: string; anyOf: Permission[] | null }[] = [
  { href: "/", label: "Dashboard", icon: "dashboard", anyOf: null },
  { href: "/calendar", label: "Calendar", icon: "calendar", anyOf: ["events.read"] },
  { href: "/attendance", label: "Attendance", icon: "attendance", anyOf: ["attendance.read"] },
  { href: "/events", label: "Events", icon: "events", anyOf: ["events.read"] },
  { href: "/members", label: "Members", icon: "members", anyOf: ["members.read"] },
  { href: "/prospects", label: "Prospective Members", icon: "prospects", anyOf: ["prospects.read"] },
  { href: "/recognition", label: "Recognition", icon: "recognition", anyOf: ["recognition.read", "points.read"] },
  { href: "/standing", label: "Probation & Standing", icon: "standing", anyOf: ["standing.read"] },
  { href: "/reports", label: "Reports", icon: "reports", anyOf: ["reports.export"] },
  { href: "/settings", label: "Settings", icon: "settings", anyOf: ["settings.manage", "users.manage", "semesters.manage", "policies.read", "data.migrate", "backup.manage"] },
  { href: "/audit", label: "Audit Log", icon: "audit", anyOf: ["audit.read"] },
];

export function navFor(can: (p: Permission) => boolean, badges: Record<string, number> = {}): NavItem[] {
  return ITEMS.filter((i) => !i.anyOf || i.anyOf.some(can)).map(({ href, label, icon }) => ({ href, label, icon, badge: badges[href] }));
}
