"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarDays, ClipboardCheck, CalendarRange, Users, UserPlus, Award, Scale, FileSpreadsheet, Settings, History,
} from "lucide-react";
import type { NavItem } from "./nav-config";
import { cn } from "@/lib/cn";

const ICONS = {
  dashboard: LayoutDashboard, calendar: CalendarDays, attendance: ClipboardCheck, events: CalendarRange, members: Users,
  prospects: UserPlus, recognition: Award, standing: Scale, reports: FileSpreadsheet, settings: Settings, audit: History,
} as const;

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
        const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4 flex-none", active ? "text-gold" : "text-slate-400")} aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className="tabular rounded-full bg-gold px-1.5 text-[11px] font-semibold text-ink">{item.badge}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
