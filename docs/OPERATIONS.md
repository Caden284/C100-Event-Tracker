# Operations guide

## A normal week for the Secretary

1. After each event, download the PIN export and import it (**Attendance → Import a PIN export**).
2. Clear **Attendance → Unmatched scans**: link people, create prospects for genuine newcomers, or dismiss with a note.
3. For paper sign-ins, open the event → **Quick entry from a paper sign-in sheet**.
4. Check the dashboard's **Needs your attention** panel. It lists past events with no attendance, missing emails, events without a category, and imports left in preview.
5. Move events on the **Calendar** as plans change. Other officers see the change immediately.

## Start of a semester

1. **Settings → Semesters → Add a semester** (dates and dues deadline).
2. **Settings → Policies:** open the current policy → **Create new draft version**, adjust the requirements, and **Request approval**. The President (or another approver) approves it with the meeting/vote record. Then **assign** it to the new semester.
3. Add the calendar: **Events → Import calendar** (CSV) or **Recurring series**.
4. **Run the rollover** (below) when the previous semester ends.

## Semester rollover

**Settings → Semesters → Semester rollover.** Choose the upcoming semester, type `ROLLOVER`, and confirm.

- The old semester is archived; its attendance, recognition and disciplinary records stay exactly as they were.
- Members and prospects carry forward with their current status. Update graduations with the member page's status field, or the bulk action on **Members** (a reason is required).
- New calculations start from zero. Old attendance never counts toward the new semester.
- Past semesters stay viewable via the semester switcher in the header.

## Backups

| What | How often | How |
|------|-----------|-----|
| In-app backup (all app tables, checksummed) | Weekly, and after every import day | Settings → Backup & restore → Download, then **Verify** it |
| Full database dump (includes logins) | Monthly and before upgrades | `npx supabase db dump --linked -f schema.sql` and `npx supabase db dump --linked --data-only -f data.sql` |
| Supabase automated backups | Daily (Pro plan only) | Dashboard → Database → Backups |

Store backups in an access-controlled location (e.g. a private folder owned by the chapter's officer account), never in this Git repository.

### Restore drill (do this once a semester)

1. Create a second, empty Supabase project (or use the local one: `npx supabase start`).
2. `npx supabase db push` to it, and bootstrap an admin.
3. **Settings → Backup & restore → Verify** the backup file, then **Restore** (type `RESTORE`).
4. Spot-check the dashboard totals against production.

Restore is a *merge*: rows in the file are upserted by ID, and nothing is deleted. Officer logins are not inside the in-app backup (Supabase Auth keeps them). Profiles and roles are restored only for accounts that exist in the target project. For a full disaster recovery, use the database dumps.

## Data protection and retention

The hub holds private student information (names, GSU emails, Panther card IDs, attendance, dues and disciplinary records).

- Give officers the **least access** their role needs. Remove roles when officers leave office (Settings → Users), and deactivate accounts of people who left the board. Their history is kept.
- Don't download sensitive exports unless needed. Sensitive columns are off by default and every export is logged.
- **Retention policy (proposed for board approval):**
  - Attendance, membership-status history, recognition results and approved disciplinary records are kept for the life of the chapter as institutional history.
  - Unresolved unmatched scans older than one academic year: dismiss with the note "Expired — not resolved".
  - Import rows (raw file contents) older than two academic years may be deleted by a super administrator; the import summaries remain.
  - When a person asks for their data to be removed, a super administrator records the request in the audit log, deletes their notes and identifiers, and replaces their name with "Former member", keeping anonymous attendance totals.
  - Backups older than one year should be deleted from storage.
- The audit log is never edited.

## Handing over to the next Secretary

1. The outgoing super administrator invites the new officers and assigns roles (Settings → Users).
2. Make sure at least **two** people hold Super Administrator, so nobody gets locked out.
3. Transfer the Supabase and Vercel projects (Organization → Members) to a chapter-owned account, not a personal one.
4. Give the new Secretary this repository, the README and this guide. Every rule is visible in **Settings → Policies** and every past decision in the **Audit Log**.
