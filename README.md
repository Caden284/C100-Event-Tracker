# C100 Membership Hub

**Collegiate 100 at Georgia State University: membership, attendance, standing and recognition in one place.**

This web app replaces the `C100_Membership_Tracker.xlsx` workbook. Executive-board officers sign in to:

- import Panther Involvement Network (PIN) attendance exports safely (no double counting, ever)
- see live dashboards, member progress and prospective-member engagement
- reschedule events by dragging them on a shared chapter calendar
- manage the membership policy, strikes and probation (**draft until the board approves it**)
- run award nominations and votes, and keep participation points
- export reports and keep full backups

> ⚠️ **Before the hub is used for official chapter decisions**, the executive board must review the migrated data and approve the membership, recognition and probation policies. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

| Doc | What's inside |
|-----|---------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works: database design, security model, how calculations are done |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Semester routine, backups and restore, rollover, data retention, handing over to the next secretary |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common errors and how to fix them |
| [docs/WORKBOOK-AUDIT.md](docs/WORKBOOK-AUDIT.md) | What was found in the original workbook and how it was migrated |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Known limitations and the policy decisions the board still has to make |

---

## Contents

1. [What you need to install](#1-what-you-need-to-install)
2. [Get the code and install dependencies](#2-get-the-code-and-install-dependencies)
3. [Create the Supabase project](#3-create-the-supabase-project)
4. [Configure environment variables](#4-configure-environment-variables)
5. [Run the database migrations](#5-run-the-database-migrations)
6. [Create the first administrator](#6-create-the-first-administrator-securely)
7. [Run the app locally](#7-run-the-app-locally)
8. [Upload the existing workbook](#8-upload-the-existing-workbook)
9. [Upload a PIN attendance export](#9-upload-a-pin-attendance-export)
10. [Add other officers](#10-add-other-officers)
11. [Test the application](#11-test-the-application)
12. [Deploy to Vercel](#12-deploy-to-vercel)
13. [Update the application](#13-update-the-application)
14. [Back up and restore](#14-back-up-and-restore)
15. [Optional: a full local Supabase for development](#15-optional-a-full-local-supabase-for-development)
16. [Project layout](#16-project-layout)

---

## 1. What you need to install

| Tool | Version | Why |
|------|---------|-----|
| [Node.js](https://nodejs.org) | 20.9 or newer (22 LTS recommended) | Runs the app and the scripts. `npm` comes with it. |
| [Git](https://git-scm.com) | any recent | Getting and updating the code |
| A [Supabase](https://supabase.com) account | free tier works | Database, logins and security |
| A [Vercel](https://vercel.com) account | free tier works | Hosting the website (step 12) |
| *(optional)* [Docker Desktop](https://www.docker.com/products/docker-desktop/) | | Only to run Supabase on your own computer (step 15) and the database tests |

Check your Node version:

```bash
node -v   # should print v20.9.0 or higher
```

## 2. Get the code and install dependencies

```bash
git clone https://github.com/Caden284/C100-Event-Tracker.git
cd C100-Event-Tracker
npm install
```

The Supabase command-line tool is installed as a project dependency, so you run it with `npx supabase …` and don't need to install anything else.

## 3. Create the Supabase project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it (e.g. `c100-membership-hub`), choose a strong **database password** (save it in a password manager), and pick the region closest to Atlanta (East US).
3. Wait for the project to finish provisioning (about 2 minutes).
4. **Turn off public sign-ups.** The hub is for invited officers only:
   - **Authentication → Sign In / Providers** (or **Providers → Email**, depending on the dashboard version): keep **Email** enabled, but switch **Allow new users to sign up** **off**.
   - **Authentication → Policies / Passwords**: set the minimum password length to **10**.
5. **Set the site URL.** **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` for now (change it to your Vercel URL in step 12).
   - *Redirect URLs*: add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm`.
6. *(Only if you will email invitations or password resets.)* Supabase's built-in email sender is heavily rate-limited, so configure a provider under **Project Settings → Authentication → SMTP**. Then edit **Authentication → Email Templates** so both links point at the app:
   - *Invite user*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

   Without email set up, you can still add officers with a one-time password (step 10).

## 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the values from **Project Settings → API** (or **API Keys**) in Supabase:

| Variable | Where to find it | Secret? |
|----------|------------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | *Project URL* | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon / publishable** key | No (it is protected by Row Level Security) |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role / secret** key | **YES.** Never share it, never commit it, never prefix it with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; your Vercel URL in production | No |

`.env.local` is already in `.gitignore`, so it will never be committed.

## 5. Run the database migrations

The database schema lives in `supabase/migrations/` (plain SQL files, applied in order). Push them to your project:

```bash
npx supabase login                         # opens a browser once
npx supabase link --project-ref YOUR-REF   # YOUR-REF is the part of the project URL before .supabase.co
npx supabase db push                       # applies every migration
```

`db push` asks for the database password from step 3.

*No CLI?* You can instead paste each file from `supabase/migrations/` into the Supabase **SQL Editor** in filename order and click **Run**.

The migrations create the tables, the security rules, and the reference data: roles, permissions, event categories and statuses. **They do not contain any member data.**

## 6. Create the first administrator securely

There is no public registration, so the first super administrator is created from your own computer with the service-role key:

```bash
npm run admin:bootstrap -- --email your.email@student.gsu.edu --name "Your Name"
```

- This prints a **one-time password once**. Sign in with it, then change it (sign out → *Forgot your password?*, or via the Supabase dashboard).
- The script refuses to run once any super administrator exists, which stops someone from minting a second one later. (`--force` exists only for lock-out recovery.)

## 7. Run the app locally

```bash
npm run dev
```

Open <http://localhost:3000> and sign in.

## 8. Upload the existing workbook

1. Go to **Settings → Workbook migration**.
2. Choose `C100_Membership_Tracker.xlsx` and click **Preview migration**. Nothing is saved yet. The preview shows:
   - all 8 worksheets found, plus record counts;
   - a **verification** that the app's recalculated attendance matches what the workbook's formulas showed (for the Fall 2026 workbook: 65 of 65 members with email match exactly);
   - data-quality findings (missing emails, placeholder emails, duplicates, roster notes). You can download these as a report.
3. Check the semester start and end dates (the workbook doesn't contain them), tick the confirmation box, and click **Commit migration**.

The migration:
- **is safe to repeat**: running it again adds nothing that already exists and never overwrites newer data;
- **can be rolled back** (by a super administrator) from the history table on the same page, unless newer data depends on it;
- imports the workbook's requirements (2 meetings / 3 general / 3 service / 3 mentoring, dues deadline Oct 8) as a **DRAFT policy**, with the strike thresholds **inactive**.

**Optional:** add the weekly "Study with C100" blocks from the Fall 2026 calendar via **Events → Import calendar** with `public/templates/fall-2026-study-blocks.csv`. They show on the calendar as Study events, which count toward nothing.

> Keep the real workbook and PIN exports out of the Git repository. `.gitignore` blocks `*.xlsx` outside `samples/`.

## 9. Upload a PIN attendance export

1. In PIN open the event → **Attendance** → export ("Event Attendance By Event"). CSV is best.
2. In the hub: **Attendance → Import a PIN export** (or **Upload PIN export** on an event's page).
3. **Columns:** these are detected automatically. Fix any that look wrong.
4. **Events:** exact PIN names match automatically. Otherwise pick the event (similar names are offered only as *suggestions*), create a new event, or defer the rows to the review queue. Tick *Remember this PIN name* so next time it matches by itself.
5. **Preview:** every row shows its outcome: *New*, *Duplicate — skipped*, *Conflict*, *Unmatched person*, *Unmapped event* or *Invalid*. Resolve any conflicts.
6. **Commit.** Then download the CSV report if you want one. Unmatched people go to **Attendance → Unmatched scans**, where you link them to the right person, create a prospect, or dismiss with a note.

Rules that are always enforced:
- one record per person per event (a database constraint), so re-uploading or overlapping exports can never double-count;
- people are matched by email, or by a reliable PIN card ID; **never by name alone**;
- nobody is marked absent unless you confirm the file is a complete roster *and* choose to reconcile.

Paper sign-in sheets: open the event → **Quick entry from a paper sign-in sheet**. Each event also has a printable **Sign-in sheet**.

## 10. Add other officers

**Settings → Users & roles → Add an officer.** Pick their roles:

| Role | Can do (default) |
|------|------------------|
| Super Administrator | Everything, including roles, permissions, backups, restore, rollback |
| Secretary | Imports, events, attendance, members, prospects, recognition setup, reports, workbook migration |
| President | Oversight of everything; approves policies, disciplinary actions and award results |
| Membership Chair | Prospective members, recruitment, conversions |
| Treasurer | Dues, plus a read-only roster |
| Executive Board Officer | Read-only: dashboard, calendar, events, members, prospects; can nominate and vote |

Choose **one-time password** (works without email setup, and you share it privately) or **email invitation** (needs SMTP, step 3.6). A super administrator can change what every role is allowed to do in the permission matrix on the same page. Every permission is enforced by the database, not just by hiding buttons.

## 11. Test the application

```bash
npm test            # 55 unit tests: parsing, matching, standing, recognition, exports (no database needed)
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run build       # production build
```

Database integration tests (33 tests covering Row Level Security, imports, policies, discipline, recognition, points and migration) need a local Supabase database (step 15):

```bash
npx supabase start
npm run test:db     # every test runs in a transaction that is rolled back
```

`TEST_DATABASE_URL` defaults to the local Supabase database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. **Never point it at production.**

## 12. Deploy to Vercel

1. Push the code to GitHub (already done if you cloned this repo).
2. In Vercel: **Add New → Project →** import the GitHub repository. The framework is detected as Next.js.
3. Under **Environment Variables**, add the four variables from step 4, with `NEXT_PUBLIC_SITE_URL` set to your production URL (e.g. `https://c100-hub.vercel.app`).
4. Click **Deploy**.
5. Back in Supabase **Authentication → URL Configuration**, set *Site URL* to the production URL and add `https://YOUR-APP.vercel.app/auth/callback` and `https://YOUR-APP.vercel.app/auth/confirm` to *Redirect URLs*.

Vercel serves everything over HTTPS. The app also sends security headers: no framing, nosniff, HSTS, and a strict referrer policy.

## 13. Update the application

```bash
git pull
npm install
npx supabase db push   # applies any new migrations
```

Vercel redeploys automatically when you push to the main branch. **Back up first** (step 14) before any update that includes new migrations.

## 14. Back up and restore

- **In the app** (super administrator, or anyone with the backup permission): **Settings → Backup & restore → Download full backup.** This downloads a JSON file with a checksum per table. Verify it right away with *Verify a backup*, or from a terminal:

  ```bash
  npm run backup:verify -- path/to/c100-hub-backup-….backup.json
  ```

  *Restore* is a **merge**: records in the file are re-created or overwritten by ID, and nothing else is deleted.
- **Whole database** (including logins), from a terminal:

  ```bash
  npx supabase db dump --linked -f backup-schema.sql
  npx supabase db dump --linked --data-only -f backup-data.sql
  ```

- Supabase **Pro** projects also keep daily backups (Dashboard → Database → Backups). The free tier does not, so download an in-app backup at least weekly and after every import day.

Store backups somewhere access-controlled. They contain private student information. See [docs/OPERATIONS.md](docs/OPERATIONS.md#backups) for a full restore drill.

## 15. Optional: a full local Supabase for development

With Docker running:

```bash
npx supabase start     # first run downloads the containers
npx supabase status    # prints the local URL, anon key and service_role key
```

Put the printed values in `.env.local` (`API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, and so on), then run `npx supabase db reset` to apply the migrations, `npm run admin:bootstrap -- --email you@example.edu`, and `npm run dev`. Use the fictional files in [`samples/`](samples/README.md) to practise.

If you change the database schema, regenerate the TypeScript types with `npm run db:types`.

## 16. Project layout

```
src/app/(auth)/        sign-in, password reset
src/app/(app)/         every signed-in page: dashboard, calendar, attendance, events, members…
src/app/api/           report downloads and backups
src/lib/domain/        pure business logic (unit-tested): matching, standing, recognition, parsing
src/lib/workbook/      reader for C100_Membership_Tracker.xlsx
src/lib/data/          database queries used by pages
src/lib/supabase/      Supabase clients (officer session vs. server-only admin)
src/components/        UI components (cards, tables, charts, calendar, forms)
supabase/migrations/   database schema, security rules and transactional workflows (SQL)
scripts/               bootstrap-admin, verify-backup, make-samples
tests/unit/            Vitest unit tests      tests/db/  database integration tests
samples/               FICTIONAL sample workbook and PIN export
public/templates/      calendar CSV templates (incl. Fall 2026 study blocks)
```

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (PostgreSQL, Auth, Row Level Security), Recharts, ExcelJS, PapaParse and dnd-kit.
