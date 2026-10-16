export const metadata = { title: "Setup required" };

export default function SetupPage() {
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink">C100 Membership Hub — setup</h1>
      {configured ? (
        <p className="mt-4 text-slate-700">Supabase is configured. <a className="text-brand underline" href="/login">Go to sign in</a>.</p>
      ) : (
        <div className="mt-4 space-y-3 text-slate-700">
          <p>The app cannot reach its database yet because the Supabase environment variables are missing.</p>
          <ol className="list-decimal space-y-1 pl-6 text-sm">
            <li>Copy <code>.env.example</code> to <code>.env.local</code>.</li>
            <li>Fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (Supabase → Project Settings → API).</li>
            <li>Restart <code>npm run dev</code>.</li>
          </ol>
          <p className="text-sm">The README section “Configure environment variables” walks through this step by step.</p>
        </div>
      )}
    </main>
  );
}
