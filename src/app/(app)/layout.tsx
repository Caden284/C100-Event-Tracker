import { AppShell } from "@/components/shell/app-shell";
import { navFor } from "@/components/shell/nav-config";
import { requireOfficer } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireOfficer();
  const [{ current, all }, counts] = await Promise.all([resolveSemester(s.supabase), s.supabase.rpc("open_review_counts")]);
  const c = (counts.data ?? {}) as Record<string, number>;
  const nav = navFor(s.can, {
    "/attendance": s.can("attendance.read") ? (c.unmatched_open ?? 0) + (c.imports_in_preview ?? 0) : 0,
    "/settings": s.can("policies.approve") ? c.policies_awaiting_approval ?? 0 : 0,
    "/standing": s.can("discipline.approve") ? c.discipline_proposed ?? 0 : 0,
  });
  return (
    <AppShell
      nav={nav}
      user={{ name: s.fullName ?? s.email, email: s.email, roles: s.roles }}
      semesters={all.map(({ id, name, status, academic_year }) => ({ id, name, status, academic_year }))}
      current={current ? { id: current.id, name: current.name, status: current.status, academic_year: current.academic_year } : null}
      unread={c.unread_notifications ?? 0}
    >
      {children}
    </AppShell>
  );
}
