# Sample data (fictional)

Everything in this folder is **made up** and safe to share. Use it to try the hub without
touching real chapter data (for example on a separate test Supabase project).

| File | What it is |
|------|------------|
| `sample-membership-tracker.xlsx` | Same 8-sheet structure as `C100_Membership_Tracker.xlsx`, fictional people. Regenerate with `npm run samples`. |
| `sample-pin-export.csv` | A PIN-style attendance export that exercises the importer: a duplicate row, an email with stray capitals/spaces, a new person, a row with no email, and a “Registered” (not attended) status. |

**Never put real exports or the real workbook in this repository.** `.gitignore` blocks
`*.xlsx` outside `samples/`, plus `/data/` and `/private/`.
