import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">That record does not exist, or you do not have permission to see it.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-brand underline">Back to dashboard</Link>
    </div>
  );
}
