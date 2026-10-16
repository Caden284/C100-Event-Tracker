import Link from "next/link";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/(auth)/login/actions";

export const metadata = { title: "No access" };

export default async function NoAccess({ searchParams }: PageProps<"/no-access">) {
  const s = await getSession();
  const need = (await searchParams).need;
  return (
    <main className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-ink">You don’t have access to this page</h1>
      <p className="mt-2 text-sm text-slate-600">
        {s?.isOfficer
          ? `Your role does not include ${typeof need === "string" ? `the “${need}” permission` : "this permission"}. Ask a super administrator if you need it.`
          : "Your account has no executive-board role yet. A super administrator must assign one before you can use the hub."}
      </p>
      <div className="mt-6 flex justify-center gap-3 text-sm">
        {s?.isOfficer ? <Link href="/" className="text-brand underline">Back to dashboard</Link> : null}
        <form action={signOut}><button className="text-slate-600 underline">Sign out</button></form>
      </div>
    </main>
  );
}
