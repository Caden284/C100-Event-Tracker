"use client";

import { chooseSemester } from "@/lib/semester-actions";

export function SemesterSwitcher({ semesters, currentId }: { semesters: { id: string; name: string; status: string; academic_year: string }[]; currentId: string | null }) {
  if (!semesters.length) return <span className="text-xs text-slate-500">No semester yet</span>;
  return (
    <form action={chooseSemester} className="flex min-w-0 items-center gap-2">
      <label htmlFor="semester-switch" className="sr-only">Semester</label>
      <select
        id="semester-switch"
        name="semester"
        defaultValue={currentId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 w-36 min-w-0 rounded-md border border-slate-300 bg-white pl-2 pr-7 text-xs font-medium text-slate-800 shadow-sm sm:w-auto"
      >
        {semesters.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.academic_year}){s.status === "active" ? " · current" : s.status === "archived" ? " · archived" : ""}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-xs underline">Switch</button>
      </noscript>
    </form>
  );
}
