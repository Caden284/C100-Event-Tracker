import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, LogOut, Search } from "lucide-react";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./nav-config";
import { SemesterSwitcher } from "./semester-switcher";
import { signOut } from "@/app/(auth)/login/actions";
import { Badge } from "@/components/ui/badge";

type Props = {
  nav: NavItem[];
  user: { name: string; email: string; roles: string[] };
  semesters: { id: string; name: string; status: string; academic_year: string }[];
  current: { id: string; name: string; status: string; academic_year: string } | null;
  unread: number;
  children: ReactNode;
};

export function AppShell({ nav, user, semesters, current, unread, children }: Props) {
  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 px-2">
          <Brand />
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <NavLinks items={nav} />
        </nav>
        <div className="mt-4 border-t border-white/10 px-2 pt-3 text-xs text-slate-400">
          <p className="truncate font-medium text-slate-200">{user.name}</p>
          <p className="truncate">{user.roles.map((r) => r.replace(/_/g, " ")).join(", ") || "No role"}</p>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-1.5 px-3 sm:gap-3 sm:px-4 lg:px-8">
          <MobileNav items={nav} />
          <div className="hidden items-center gap-2 sm:flex">
            {current ? (
              <Badge tone={current.status === "active" ? "green" : current.status === "archived" ? "neutral" : "blue"}>
                {current.status === "archived" ? "Archived semester" : current.status === "active" ? "Current semester" : "Upcoming semester"}
              </Badge>
            ) : null}
            <span className="text-xs text-slate-500">Academic year {current?.academic_year.replace("-", "–") ?? "—"}</span>
          </div>
          <SemesterSwitcher semesters={semesters} currentId={current?.id ?? null} />
          <form action="/search" className="ml-auto hidden md:block" role="search">
            <label htmlFor="global-search" className="sr-only">Search members, prospects and events</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" aria-hidden />
              <input
                id="global-search"
                name="q"
                placeholder="Search people & events…"
                className="h-8 w-56 rounded-md border border-slate-300 bg-slate-50 pl-8 pr-2 text-sm focus:bg-white lg:w-72"
              />
            </div>
          </form>
          <Link href="/search" className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>
          <Link href="/notifications" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
            <Bell className="h-5 w-5" />
            {unread ? <span className="tabular absolute right-1 top-1 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}
          </Link>
          <form action={signOut}>
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100" title={`Signed in as ${user.email}`}>
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
