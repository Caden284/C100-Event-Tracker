# Architecture

## Stack and why

| Layer | Choice | Why |
|-------|--------|-----|
| Web app | **Next.js 16 (App Router) + React 19 + TypeScript** | One codebase for pages and server logic; server components keep data on the server |
| Styling | **Tailwind CSS 4** and a small in-repo component set (`src/components/ui`) in the shadcn/ui style | Consistent look with no heavy dependency; easy to read and change |
| Database & auth | **Supabase** (PostgreSQL, Auth, Row Level Security) | Real relational data, secure logins, permissions enforced *in the database* |
| Files | **ExcelJS** (xlsx read/write) and **PapaParse** (CSV) | Maintained parsers. SheetJS's npm package is outdated, so ExcelJS is used instead |
| Charts | **Recharts** | Simple, accessible React charts |
| Calendar drag-and-drop | **dnd-kit** | Mouse and touch support; a keyboard-friendly "Move to date" form is the alternative |
| Hosting | **Vercel** + Supabase | Free tiers, HTTPS by default |

`next.config.ts` sets `cacheComponents: false`. Every page shows private, per-officer data, so the simpler dynamic-rendering model is used. If a future Next.js version makes Cache Components mandatory, wrap the per-request parts of pages in `<Suspense>` (see `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`).

## Security model

1. **No public sign-up.** Officers are created by a super administrator (Settings → Users). The very first one is created by `scripts/bootstrap-admin.ts`, which needs the service-role key and refuses to run twice.
2. **Row Level Security on every table.** Policies call `public.has_permission('…')`, which checks the signed-in user's roles in `user_roles → role_permissions`. The `anon` role has no grants at all. A user with no role sees nothing.
3. **Server-side checks too.** Every page calls `requirePermission(...)`, and every server action and route handler calls `assertPermission(...)` *before* touching data. The UI hides what you can't use, but hiding is never the only check.
4. **Business-rule triggers** enforce things RLS can't express:
   - policies must start as drafts; only `policies.approve` can approve them; approved policies are immutable;
   - formal disciplinary actions need an *approved* policy, or an explicit override with a written reason by someone who can approve;
   - only super admins can grant or revoke super admin, and the last super admin cannot be removed;
   - membership-status changes and attendance corrections require a reason;
   - only approvers can make a recognition result official; votes are capped and must fall inside voting windows;
   - changing an archived semester's policy requires a recorded decision (`assign_policy_to_semester`).
5. **The service-role key** is used only on the server (`src/lib/supabase/admin.ts`, marked `server-only`) and only *after* the officer's own permission check: inviting officers, and backup/restore.
6. **Audit log.** The `audit_row_change` trigger records who changed what (only changed columns) on important tables, and `log_audit()` records exports, backups, imports and migrations. Officers cannot insert, update or delete audit rows. Note bodies are redacted in the log, and votes are logged without the nominee, so ballots stay anonymous.
7. **Uploads** are validated by content (zip magic bytes for xlsx, no NUL bytes for CSV), size and row limits, and balanced quotes. Legacy `.xls` and binaries are rejected. Uploads go through Server Actions, which Next.js protects against cross-site request forgery with an Origin check.
8. **CSV/XLSX exports** neutralise spreadsheet-formula injection (`safeCell`). Sensitive columns need `reports.sensitive`. Every export is audited.
9. **Headers:** `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, HSTS, a strict referrer policy and a permissions policy.

## Data model (main tables)

```
semesters ─┬─ events ─┬─ event_pin_names        (exact PIN titles / aliases)
           │          └─ attendance_records ── people ─┬─ person_identifiers (emails incl. old ones, card ids)
           │                 └─ absence_excuses (reason, note; restricted)  (absence_reasons)
           │                 UNIQUE(event, person)     ├─ members ─┬─ member_notes / member_dues / member_status_history
           │                                           │           ├─ strike_records (trigger_key) / strike_dismissals / disciplinary_actions
           │                                           └─ prospective_members (→ converted_member_id)
           ├─ membership_policies (draft→approved→retired, versioned) ── policy_approvals
           ├─ recognition_periods ── nominations / votes / results   (recognition_categories)
           └─ point_transactions  (point_rules)
attendance_imports ── attendance_import_rows ── unmatched_scans
roles / permissions / role_permissions / user_roles / profiles
audit_logs · notifications · notification_preferences · app_settings · migration_runs
```

Key decisions:

- **One stable person id.** `people.id` never depends on name or email. Members and prospects are *roles* a person holds, so converting a prospect keeps all their history on the same person.
- **Emails live in `person_identifiers`.** Changing an email marks the old one as previous (`is_primary = false`) instead of deleting it, so older exports still match the right person.
- **Deduplication is a database constraint:** `attendance_records UNIQUE (event_id, person_id)`. On top of that, each import row stores a SHA-256 fingerprint, and each file's SHA-256 is kept to warn about exact re-uploads.
- **No stored totals.** Counts, progress and standing are calculated from `attendance_records` when a page loads (`v_attendance_detail` → `src/lib/domain/progress.ts`), so they can't go stale. A spreadsheet-formula-style "source of truth" does not exist.
- **Counting rules belong to the versioned policy.** `policy.rules.requirements[]` maps event categories to requirements. An event can carry a chapter-approved `counting_override`.

## Where calculations live

| Calculation | Where | Notes |
|-------------|-------|-------|
| Matching rows to events and people, duplicates, conflicts | SQL `classify_attendance_import()` | One implementation, used by both the preview and the commit |
| Committing an import | SQL `commit_attendance_import()` | Single transaction |
| Attendance progress, calculated standing, Standout, behind pace | TS `computeProgress()` | Policy rules are JSON, so this is clearer in TypeScript. Each result explains its reasons |
| Strike eligibility | TS `strikeEligibility()` | Always states whether the policy is a draft |
| Strike suggestions | TS `suggestStrikes()` (`src/lib/domain/strikes.ts`) | Rules come from the policy JSON. Each suggestion has a stable `trigger_key`; confirming inserts a `strike_records` row with it (unique per member and semester), dismissing inserts a `strike_dismissals` row. The server recalculates suggestions before confirming |
| Excused absences | SQL `record_absence()` | The only way to set the `excused` status; a trigger rejects it elsewhere, and PIN files can't set it |
| Prospect interest | TS `prospectEngagement()` | Thresholds in `app_settings.prospect_engagement` (workbook: 3+ High, 2 Medium) |
| Most improved | TS `improvement()` | Compares *rates* (attended ÷ counted events available); no baseline means no ranking |
| Award eligibility | TS `evaluateEligibility()` + `src/lib/data/recognition.ts` | Configurable thresholds; blank means "not configured" |
| Workbook migration | TS parser + SQL `commit_workbook_migration()` | Idempotent; `rollback_workbook_migration()` refuses if later data depends on the run |

### Standing logic (from the workbook, configurable)

- **No email:** can't be tracked reliably. This is a data-quality warning, *not* evidence of absence.
- **Good Standing:** every requirement met **and** dues paid or waived (if the policy requires dues).
- **Standout:** total counted events ≥ multiplier × combined requirement (1.5 × 11 = **17**). *Difference from the workbook:* shown as a separate badge, so a member can be both Good Standing and Standout.
- **In Progress:** anything else.
- Statuses outside `tracked_statuses` (by default anything other than Active) show **Not tracked**.
- Attendance before a member's `member_since` date isn't counted unless the policy enables `credit_pre_membership_attendance`.
