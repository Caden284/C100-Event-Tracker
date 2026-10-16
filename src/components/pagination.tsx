import Link from "next/link";
import { cn } from "@/lib/cn";

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="px-4 py-3 text-xs text-slate-500">{total} record{total === 1 ? "" : "s"}</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-md px-3 py-1.5 text-xs text-slate-300">{label}</span>
    ) : (
      <Link href={href(p)} className={cn("rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50")}>
        {label}
      </Link>
    );
  return (
    <nav className="no-print flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3" aria-label="Pagination">
      <p className="text-xs text-slate-500">
        Showing <span className="tabular">{from}–{to}</span> of <span className="tabular">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {link(page - 1, "Previous", page <= 1)}
        <span className="tabular text-xs text-slate-500">Page {page} of {pages}</span>
        {link(page + 1, "Next", page >= pages)}
      </div>
    </nav>
  );
}
