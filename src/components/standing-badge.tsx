import { Badge, MEMBER_STATUS_TONES } from "@/components/ui/badge";
import type { ProgressResult } from "@/lib/domain/progress";
import { STANDING_LABELS } from "@/lib/domain/progress";

export function StandingBadge({ p, draft }: { p: ProgressResult; draft?: boolean }) {
  const tone = p.standing === "good_standing" ? "blue" : p.standing === "no_email" ? "amber" : p.standing === "not_tracked" ? "neutral" : "neutral";
  return (
    <span className="inline-flex flex-wrap gap-1" title={p.reasons.join(" ")}>
      <Badge tone={tone}>{STANDING_LABELS[p.standing]}{draft ? " · draft" : ""}</Badge>
      {p.isStandout ? <Badge tone="gold">Standout</Badge> : null}
      {p.behindPace ? <Badge tone="amber">Behind pace</Badge> : null}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={MEMBER_STATUS_TONES[status] ?? "neutral"}>{label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
