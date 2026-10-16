import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/form";
import { MigrationWizard } from "./wizard";
import { rollbackMigration } from "./actions";

export const metadata = { title: "Workbook migration" };

export default async function MigrationPage() {
  const s = await requirePermission("data.migrate");
  const { data: runs } = await s.supabase.from("migration_runs").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Workbook migration" back={{ href: "/settings", label: "Settings" }}
        description="Imports C100_Membership_Tracker.xlsx: all eight worksheets, members, prospective members, events, the attendance log, unmatched scans and settings. Safe to repeat — it never duplicates or overwrites records." />
      <Callout tone="info" className="mb-5" title="What happens to formulas">
        Formula columns (Meetings, Total, Standing, Strike Status, Dues Status, Events Attended, Interest Level…) are not copied. The app recalculates them from the attendance log, and the preview checks its results against the values Excel last showed.
      </Callout>
      <MigrationWizard />
      <Card className="mt-6">
        <CardHeader title="Migration history" description="A run can be rolled back only if nothing created afterwards depends on it (super administrators only)." />
        {(runs ?? []).length === 0 ? <EmptyState title="No migrations yet" /> : (
          <Table>
            <THead><tr><TH>When</TH><TH>File</TH><TH>Result</TH><TH>Status</TH><TH className="text-right">Rollback</TH></tr></THead>
            <TBody>
              {(runs ?? []).map((r) => {
                const sm = r.summary as Record<string, number>;
                return (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-US")}</TD>
                    <TD>{r.file_name}</TD>
                    <TD className="text-xs">{sm.members_created ?? 0} members · {sm.prospects_created ?? 0} prospects · {sm.events_created ?? 0} events · {sm.attendance_created ?? 0} attendance · {sm.attendance_unresolved ?? 0} to review</TD>
                    <TD><Badge tone={r.status === "committed" ? "green" : "neutral"}>{r.status.replace("_", " ")}</Badge></TD>
                    <TD className="text-right">
                      {r.status === "committed" && s.isSuperAdmin ? (
                        <ActionForm action={rollbackMigration} className="flex justify-end gap-2" confirm={{ title: "Roll back this migration?", body: "All members, prospects, events and attendance created by this run will be deleted. This is refused if newer data depends on them.", confirmLabel: "Roll back", danger: true }}>
                          <input type="hidden" name="run_id" value={r.id} />
                          <Input name="reason" placeholder="Reason" required minLength={5} className="h-8 w-40 text-xs" />
                          <SubmitButton size="sm" variant="danger-outline">Roll back</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
