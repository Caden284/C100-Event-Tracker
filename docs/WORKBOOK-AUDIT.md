# Audit of `C100_Membership_Tracker.xlsx` (Fall 2026)

The audit was done before the app was designed. Aggregate figures only; no personal data is recorded here.

## Worksheets and how they map

| Sheet | Contents | Migrated to |
|-------|----------|-------------|
| **Dashboard** | Formula-only summary cards | Not imported (the app's dashboard is live). Cached values are shown in the migration preview for comparison |
| **Settings** | Requirements (2 meetings / 3 general / 3 service / 3 mentoring), dues deadline Oct 8 2026, category definitions | A **DRAFT** membership policy assigned to *Fall 2026*; the semester's dues deadline |
| **Events** | 30 events; Category dropdown (Meeting, General, Service, Mentoring, Study, Recruitment); PIN name; formula Status/counts | `events`, `event_pin_names` (8 PIN names). Notes containing "PENDING" → *pending approval*; "Confirmed" → *confirmed*; "paper sign-in" → paper source; no date → *Date TBD* |
| **Attendance Log** | 333 rows across 8 events (Sep 2–24), all "Attended"; Category & Person Type are formulas | `attendance_records` (source *workbook migration*), keeping Marked By / Marked On / Card ID |
| **Members** | 77 people: 74 Active, 3 Not Verified; 17 with E-Board roles; Committee, Dues and Strikes blank/0 for everyone; 39 identity notes | `people`, `person_identifiers`, `members`, `member_notes` (private). Strikes kept as `legacy_strikes` |
| **Prospective Members** | 125 people; Events Attended / Interest Level are formulas | `prospective_members` (first-seen event linked when the PIN name matches) |
| **Unmatched Scans** | 1 paper sign-in with no email | `unmatched_scans` (review queue) |
| **How To Use** | Update workflow, standing logic, "what counts", roster decisions | Logic re-implemented in the app; roster decisions are listed in the migration report |

## Business logic found (formulas)

- Counts per category = `COUNTIFS(Attendance Log email = member email, category, "Attended")`, so **matching is by email only**. A member without an email always shows 0.
- `Total (counted)` = Meetings + General + Service + Mentoring. **Study is excluded.**
- `Standing`: No email → Good Standing (all four met **and** Dues = Y) → Standout (Total ≥ 1.5 × 11 = 17) → In Progress.
- `Strike Status`: 1 = Warning, 2 = Probation, ≥3 = REMOVAL. Imported as a **draft**; not activated.
- Prospect `Interest Level`: ≥3 events High, 2 Medium, otherwise Low. It counts *all* attended scans, including member events.
- Recruitment (Meet the 100): member scans are logged but not counted.
- Study with C100: removed from the Events tab on 9/25 at the chapter's request. The Fall 2026 calendar still shows weekly study blocks, so they are added to the calendar as Study events that count toward nothing.

## Verification

The migration preview recalculates every member's category counts from the attendance log and compares them with the workbook's cached formula results: **65 of 65 members with an email match exactly (0 mismatches).**

## Data-quality findings (for the board/secretary to resolve)

| Finding | Count | Handling |
|---------|-------|----------|
| Members with no email | 12 (9 Active, 3 Not Verified) | Flagged "No email", never treated as absent. Add emails on member pages |
| Members with only a first name | 7 | Imported as-is; notes suggest possible PIN matches. **Not merged automatically** |
| Prospects with placeholder "emails" (`MANUAL-…`) | 2 | Kept as placeholders so their paper sign-in attendance stays attached; replace with real emails |
| Non-student email domain | 1 | Imported (valid email) |
| Card ID `MANUAL` shared by 21 paper sign-ins | 21 rows | Not used as an identifier; real 9-digit card IDs (170) recorded for future matching |
| Paper sign-in rows dated 09/25 (entry date) for a 9/18 event | 21 | Event date taken from the Events tab; the original "Marked On" text is preserved |
| Past events with no roster yet (Oct 5 – Oct 15, plus Sandwich Run) | 6 | Shown under "Past events without attendance" |
| Unmatched paper sign-in | 1 | In the review queue with name-based suggestions (not applied) |
| Duplicate emails / names across sheets | 0 | — |
| Calendar vs workbook: Homecoming Pilates date | grid & workbook Oct 23, calendar footnote Oct 10 | Kept **Oct 23**, pending approval (confirmed by the Secretary) |
