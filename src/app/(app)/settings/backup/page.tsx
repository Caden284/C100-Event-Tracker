import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { restoreBackupAction, verifyBackupAction } from "./actions";

export const metadata = { title: "Backup & restore" };

export default async function BackupPage() {
  const s = await requirePermission("backup.manage");
  return (
    <>
      <PageHeader title="Backup & restore" back={{ href: "/settings", label: "Settings" }} description="Separate from ordinary reports. A backup contains private member data — store it somewhere access-controlled (not a shared drive)." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="1 · Download a backup" />
          <CardBody className="space-y-3 text-sm">
            <p>Every application table as JSON, with a checksum per table.</p>
            <a href="/api/backup" className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-600">Download full backup</a>
            <p className="text-xs text-slate-500">Not included: login passwords (kept by Supabase Auth). Supabase also keeps its own daily database backups on paid plans; see README → Backups.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="2 · Verify a backup" description="Do this right after downloading, and before any restore." />
          <CardBody>
            <ActionForm action={verifyBackupAction} className="space-y-3">
              <Input name="file" type="file" accept=".json,application/json" required aria-label="Backup file" />
              <SubmitButton size="sm" variant="secondary">Verify file</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="3 · Restore" description="Merge restore: records in the file are re-created or overwritten by ID. Nothing else is deleted." />
          <CardBody className="space-y-3">
            {!s.isSuperAdmin ? <Callout tone="warning">Only a super administrator can restore.</Callout> : (
              <ActionForm action={restoreBackupAction} className="space-y-3" confirm={{ title: "Restore this backup?", body: "Records in the backup overwrite the same records in the database. Officer accounts that no longer exist in Supabase Auth are skipped.", confirmLabel: "Restore", danger: true }}>
                <Input name="file" type="file" accept=".json,application/json" required aria-label="Backup file" />
                <Field label="Reason" htmlFor="rr"><Input id="rr" name="reason" /></Field>
                <Input name="confirm_text" placeholder="Type RESTORE" required aria-label="Confirmation" />
                <SubmitButton size="sm" variant="danger-outline">Restore</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
