import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/brand/c100-seal-240.webp" alt="Collegiate 100 at Georgia State University — The Groundbreaking Chapter, est. 2019" width={240} height={193} className="h-28 w-auto" priority />
        <h1 className="mt-4 text-xl font-semibold text-white">C100 Membership Hub</h1>
        <p className="text-sm text-slate-400">Executive board access only</p>
      </div>
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-slate-500">
        Accounts are created by a super administrator. Contains private member information — do not share your login.
      </p>
    </div>
  );
}
