/**
 * Full administrative backup / restore of the application tables.
 *
 * - Export: every application table, with a SHA-256 checksum per table so a file
 *   can be verified before it is trusted.
 * - Restore: NON-DESTRUCTIVE merge (upsert by primary key). Nothing that exists
 *   only in the database is deleted. Circular references are restored in two passes.
 * - Not included: Supabase Auth accounts (passwords live in Supabase, not here) and
 *   restoring the audit log (it is append-only; the backup keeps a copy for archive).
 *   For full disaster recovery also keep Supabase's own database backups (see README).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_FORMAT = "c100-membership-hub-backup";
export const BACKUP_VERSION = 1;

/** Restore order respects foreign keys. */
export const TABLES: { name: string; pk: string[]; generated?: string[]; circular?: string[]; restore?: boolean }[] = [
  { name: "profiles", pk: ["id"] },
  { name: "roles", pk: ["key"] },
  { name: "permissions", pk: ["key"] },
  { name: "role_permissions", pk: ["role_key", "permission_key"] },
  { name: "user_roles", pk: ["user_id", "role_key"] },
  { name: "app_settings", pk: ["key"] },
  { name: "event_categories", pk: ["key"] },
  { name: "member_statuses", pk: ["key"] },
  { name: "attendance_statuses", pk: ["key"] },
  { name: "semesters", pk: ["id"], circular: ["policy_id"] },
  { name: "membership_policies", pk: ["id"] },
  { name: "policy_approvals", pk: ["id"] },
  { name: "events", pk: ["id"] },
  { name: "event_pin_names", pk: ["id"], generated: ["pin_name_normalized"] },
  { name: "people", pk: ["id"] },
  { name: "person_identifiers", pk: ["id"], generated: ["value_normalized"] },
  { name: "members", pk: ["id"], circular: ["converted_from_prospect_id"] },
  { name: "prospective_members", pk: ["id"] },
  { name: "member_status_history", pk: ["id"] },
  { name: "member_notes", pk: ["id"] },
  { name: "member_dues", pk: ["id"] },
  { name: "attendance_imports", pk: ["id"] },
  { name: "attendance_import_rows", pk: ["id"], circular: ["attendance_record_id"] },
  { name: "attendance_records", pk: ["id"] },
  { name: "unmatched_scans", pk: ["id"] },
  { name: "migration_runs", pk: ["id"] },
  { name: "strike_records", pk: ["id"] },
  { name: "disciplinary_actions", pk: ["id"] },
  { name: "recognition_categories", pk: ["id"] },
  { name: "recognition_periods", pk: ["id"] },
  { name: "recognition_nominations", pk: ["id"] },
  { name: "recognition_votes", pk: ["id"] },
  { name: "recognition_results", pk: ["id"] },
  { name: "point_rules", pk: ["id"] },
  { name: "point_transactions", pk: ["id"] },
  { name: "notification_preferences", pk: ["role_key", "type"] },
  { name: "notifications", pk: ["id"] },
  { name: "audit_logs", pk: ["id"], restore: false },
];

export type BackupFile = {
  format: string;
  version: number;
  created_at: string;
  created_by: string | null;
  counts: Record<string, number>;
  checksums: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
};

export function checksum(rows: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function exportBackup(admin: AnyClient, createdBy: string | null): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  const counts: Record<string, number> = {};
  const checksums: Record<string, string> = {};
  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      let q = admin.from(t.name).select("*").range(from, from + 999);
      for (const k of t.pk) q = q.order(k);
      const { data, error } = await q;
      if (error) throw new Error(`${t.name}: ${error.message}`);
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < 1000) break;
    }
    tables[t.name] = rows;
    counts[t.name] = rows.length;
    checksums[t.name] = checksum(rows);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: new Date().toISOString(), created_by: createdBy, counts, checksums, tables };
}

export type Verification = { ok: boolean; problems: string[]; counts: Record<string, number>; createdAt: string | null };

export function verifyBackup(raw: unknown): Verification {
  const problems: string[] = [];
  const b = raw as Partial<BackupFile>;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) return { ok: false, problems: ["Not a C100 Membership Hub backup file."], counts: {}, createdAt: null };
  if (b.version !== BACKUP_VERSION) problems.push(`Unsupported backup version ${b.version}.`);
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = b.tables?.[t.name];
    if (!Array.isArray(rows)) { problems.push(`Missing table ${t.name}.`); continue; }
    counts[t.name] = rows.length;
    if (b.counts?.[t.name] !== rows.length) problems.push(`${t.name}: row count does not match the header.`);
    if (b.checksums?.[t.name] !== checksum(rows)) problems.push(`${t.name}: checksum mismatch — the file was modified or corrupted.`);
    for (const r of rows.slice(0, 5)) for (const k of t.pk) if (!(k in (r as object))) problems.push(`${t.name}: rows are missing the key column ${k}.`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], counts, createdAt: b.created_at ?? null };
}

export async function restoreBackup(admin: AnyClient, backup: BackupFile): Promise<Record<string, number>> {
  const v = verifyBackup(backup);
  if (!v.ok) throw new Error(`Backup failed verification: ${v.problems.join(" ")}`);
  const restored: Record<string, number> = {};
  // Auth accounts are not part of the backup; skip profiles/roles for users that no longer exist.
  const existingUsers = new Set<string>();
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => existingUsers.add(u.id));
    if (data.users.length < 1000) break;
  }
  const userColumn: Record<string, string> = { profiles: "id", user_roles: "user_id", notifications: "recipient_id" };
  const clean = (t: (typeof TABLES)[number], r: Record<string, unknown>, pass: 1 | 2) => {
    const out = { ...r };
    for (const g of t.generated ?? []) delete out[g];
    if (pass === 1) for (const c of t.circular ?? []) out[c] = null;
    return out;
  };
  for (const pass of [1, 2] as const) {
    for (const t of TABLES) {
      if (t.restore === false) continue;
      if (pass === 2 && !t.circular?.length) continue;
      let rows = backup.tables[t.name] ?? [];
      const col = userColumn[t.name];
      if (col) rows = rows.filter((r) => existingUsers.has(String(r[col])));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => clean(t, r, pass));
        const { error } = await admin.from(t.name).upsert(chunk, { onConflict: t.pk.join(",") });
        if (error) throw new Error(`Restoring ${t.name}: ${error.message}`);
      }
      if (pass === 1) restored[t.name] = rows.length;
    }
  }
  return restored;
}
