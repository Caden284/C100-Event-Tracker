import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, Info, ShieldAlert, FileWarning } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, back = { href: "/", label: "Dashboard" }, badge }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } | null; badge?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back ? (
        <Link href={back.href} className="no-print inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            {title} {badge}
          </h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const calloutTones = {
  info: { cls: "border-brand-100 bg-brand-50 text-brand-700", Icon: Info },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  danger: { cls: "border-red-200 bg-red-50 text-red-800", Icon: ShieldAlert },
  draft: { cls: "border-amber-300 border-dashed bg-[#fffbeb] text-amber-900", Icon: FileWarning },
} as const;

export function Callout({ tone = "info", title, children, className }: { tone?: keyof typeof calloutTones; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { cls, Icon } = calloutTones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {children ? <div className="max-w-md text-sm text-slate-500">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, href, tone = "default", icon }: {
  label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "warn" | "danger" | "good" | "draft"; icon?: ReactNode;
}) {
  const toneCls = {
    default: "border-slate-200",
    warn: "border-amber-200 bg-amber-50/40",
    danger: "border-red-200 bg-red-50/40",
    good: "border-emerald-200 bg-emerald-50/40",
    draft: "border-dashed border-amber-300 bg-[#fffbeb]",
  }[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="tabular mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  const cls = cn("block rounded-lg border bg-white px-4 py-3 shadow-sm", toneCls, href && "transition hover:border-brand hover:shadow");
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function DescList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{i.label}</dt>
          <dd className="mt-0.5 break-words text-slate-900">{i.value ?? <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "green" | "amber" }) {
  const pct = max <= 0 ? 100 : Math.min(100, Math.round((value / max) * 100));
  const bar = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-brand";
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn("h-1.5 rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="no-print -mb-px flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === current ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
