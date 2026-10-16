"use client";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white">Print</button>;
}
