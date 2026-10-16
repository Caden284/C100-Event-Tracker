import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const err = typeof params.error === "string" ? params.error : undefined;
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-ink">Sign in</h2>
      {err ? <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
      <LoginForm next={next} />
    </>
  );
}
