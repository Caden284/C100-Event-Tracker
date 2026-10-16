export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-64 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-slate-200/70" />)}
      </div>
      <div className="h-72 rounded-lg bg-slate-200/60" />
    </div>
  );
}
