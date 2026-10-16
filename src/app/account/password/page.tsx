import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PasswordForm } from "./form";

export const metadata = { title: "Set password" };

export default async function SetPasswordPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4">
      <Image src="/brand/c100-seal-240.webp" alt="Collegiate 100 seal" width={240} height={193} className="mb-6 h-24 w-auto" />
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-lg font-semibold text-ink">Choose a password</h1>
        <p className="mb-4 text-sm text-slate-600">Signed in as {s.email}.</p>
        <PasswordForm />
      </div>
    </div>
  );
}
