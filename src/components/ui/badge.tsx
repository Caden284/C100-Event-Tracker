import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  gold: "bg-[#faf3e0] text-gold-700 ring-[#ecd9a6]",
  draft: "bg-white text-amber-800 ring-amber-300 border border-dashed border-amber-400",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export const CATEGORY_TONES: Record<string, Tone> = {
  meeting: "blue", general: "purple", service: "green", mentoring: "amber", study: "neutral", recruitment: "rose",
};

export const MEMBER_STATUS_TONES: Record<string, Tone> = {
  active: "green", not_verified: "amber", inactive: "neutral", graduated: "blue", removed: "red",
};
