import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}
export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-slate-50/70", className)} {...props} />;
}
export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("px-4 py-2.5 whitespace-nowrap", className)} {...props} />;
}
export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-2.5 align-top text-slate-700", className)} {...props} />;
}

/** Column header that sorts via the URL (works without JavaScript, bookmarkable). */
export function SortTH({ label, sortKey, current, dir, href, className }: { label: string; sortKey: string; current?: string; dir?: string; href: (sort: string, dir: string) => string; className?: string }) {
  const active = current === sortKey;
  const next = active && dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href(sortKey, next)} className="inline-flex items-center gap-1 hover:text-slate-800">
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </Link>
    </TH>
  );
}
