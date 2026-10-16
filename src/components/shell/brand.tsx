import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/brand/c100-seal-96.webp" alt="Collegiate 100 at Georgia State University seal" width={44} height={35} className="h-9 w-auto" priority />
      {!compact ? (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">C100 Membership Hub</p>
          <p className="text-[11px] text-slate-400">Collegiate 100 · GSU</p>
        </div>
      ) : null}
    </div>
  );
}
