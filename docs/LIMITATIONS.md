# Remaining limitations and decisions for the executive board

## Decisions the board must make before official use

Nothing below is enforced as a chapter rule until an authorized officer approves it in **Settings → Policies** (and, for awards and points, in **Recognition**).

1. **Fall 2026 attendance requirements.** 2 meetings / 3 general / 3 service / 3 mentoring were imported from the workbook as a **draft**. Approve or amend them.
   - The hub found that only **2 mentoring events remain scheduled** this semester, while the draft requires 3. Add a mentoring event, or adjust the requirement.
2. **Dues and Good Standing.** Should unpaid dues prevent Good Standing (workbook: yes)? What is the dues amount? Who records payments: the Treasurer only?
3. **Strike policy** (draft: 1 = Warning, 2 = Probation, 3 = Removal). What earns a strike, when strikes are reviewed (continuously or at checkpoints), whether they expire at semester end, and whether to enable it at all.
4. **Probation:** criteria, notice to the member, the review meeting, the appeal process and its deadlines. The **Probation & Standing → Policy checklist** tab lists suggested options, clearly marked as proposals.
5. **Excused absences:** adopt them? (The "Excused" status exists but is switched off.) Do they count as attendance?
6. **New members:** does recruitment-period attendance count once someone becomes a member? (Default: no.)
7. **Study sessions:** currently tracked on the calendar and counting toward nothing, per the 9/25 request.
8. **Awards:** eligibility thresholds, whether each of *Outstanding General Body Member*, *Outstanding Perspective* and *Most Improved Member* uses nominations, voting and/or an officer decision; who votes; anonymous or not; who sees results.
9. **Points:** no point values have been set. Define rules, caps and who may award points, or leave the feature unused.
10. **Data retention:** approve or amend the proposal in [OPERATIONS.md](OPERATIONS.md#data-protection-and-retention).
11. **Semester dates:** Fall 2026 was set to Aug 15 – Dec 15 because the workbook has no dates. Adjust in Settings → Semesters.
12. **Super administrators:** name at least two.
13. **Roster clean-up:** confirm the 3 *Not Verified* members and add the missing emails.

## Known limitations of the software

- **No live PIN connection.** PIN has no integration here; officers download exports from PIN and upload them.
- **No email delivery.** Notifications are in-app only. Officer invitations and password resets by email need an SMTP provider configured in Supabase (otherwise use one-time passwords).
- **Saved filters** are URLs: bookmark a filtered page to save it. There are no named saved filters.
- **Restore is merge-only.** It never deletes; for a clean disaster recovery, restore a database dump. Login accounts and the audit log aren't restored from the in-app backup. Restoring into an empty project adds one extra "Record created" entry to each member's status history.
- **Most Improved** needs a previous semester in the hub, so it cannot rank anyone during the first semester of use.
- **"Behind pace"** is a simple heuristic (progress vs. share of the semester elapsed, with a configurable margin). Treat it as a prompt, not a judgment.
- The policy editor supports up to **12 requirements** and **6 strike thresholds**.
- **Voting eligibility** is by permission (`recognition.vote`), not by per-period voter lists.
- **Notification settings** are per role; if any of a person's roles turns a type off, they don't receive it.
- **Calendar drag-and-drop** is for tablets and desktops. On phones the calendar becomes an agenda list, and events are moved with **Move to date**.
- **Bulk resolution** of unmatched scans is not available (resolved one at a time, by design, to avoid wrong merges).
- Aggregations run in the app server and are sized for a chapter (thousands of records). For tens of thousands, move them into SQL views.
- No dark mode. Dates are calendar dates; "today" uses Eastern Time.
- **Tests:** 55 unit tests run with `npm test`; 33 database tests need a local Supabase (`npm run test:db`). The browser walkthrough (sign-in, migration, import wizard, calendar drag-and-drop, role restrictions, mobile layout, backup and restore) was run manually with Playwright during development, but is not committed as an automated end-to-end suite.
