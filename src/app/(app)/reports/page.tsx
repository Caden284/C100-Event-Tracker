import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { REPORTS, reportAllowed } from "@/lib/reports";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const s = await requirePermission("reports.export");
  const { current, all } = await resolveSemester(s.supabase);
  const allowed = REPORTS.filter((r) => reportAllowed(s, r));
  const groups = [...new Set(allowed.map((r) => r.group))];
  return (
    <>
      <PageHeader title="Reports" description="Downloads are generated from the current database and the approved (or clearly labeled draft) calculations — never from stale spreadsheet formulas." />
      <Callout tone="info" className="mb-4">
        {s.can("reports.sensitive")
          ? "Columns marked 🔒 contain notes, dues or disciplinary details. They are off by default — include them only when needed."
          : "Sensitive columns (notes, dues amounts, disciplinary details) are not available to your role."}{" "}
        Every export is recorded in the audit log.
      </Callout>
      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {allowed.filter((r) => r.group === g).map((r) => (
              <Card key={r.key}>
                <CardHeader title={r.title} description={r.description} />
                <CardBody>
                  <form action={`/api/reports/${r.key}`} method="get" className="space-y-3">
                    <fieldset>
                      <legend className="text-xs font-medium text-slate-700">Columns</legend>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {r.columns.filter((c) => !c.sensitive || s.can("reports.sensitive")).map((c) => (
                          <label key={c.key} className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" name="col" value={c.key} defaultChecked={c.default && !c.sensitive} />
                            {c.label}
                            {c.sensitive ? " 🔒" : ""}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`sem-${r.key}`}>Semester</label>
                      <Select id={`sem-${r.key}`} name="semester" defaultValue={current?.id} className="h-8 w-40 text-xs">
                        {all.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </Select>
                      <button name="format" value="csv" className="h-8 rounded-md bg-brand px-3 text-xs font-medium text-white hover:bg-brand-600">Download CSV</button>
                      <button name="format" value="xlsx" className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50">Download Excel</button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
