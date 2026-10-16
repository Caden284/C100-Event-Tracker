"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm" role="alert">
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">{error.message || "An unexpected error occurred."}</p>
      {error.digest ? <p className="mt-1 text-xs text-slate-400">Reference: {error.digest}</p> : null}
      <div className="mt-4 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex items-center text-sm text-brand underline">Dashboard</Link>
      </div>
    </div>
  );
}
