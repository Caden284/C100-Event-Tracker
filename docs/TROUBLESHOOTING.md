# Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| App redirects to **/setup** | Supabase variables missing | Fill `.env.local` (README step 4) and restart `npm run dev`. On Vercel, add the variables and redeploy. |
| "Email or password is incorrect" for a new officer | Account not created yet, or wrong one-time password | Re-create from Settings → Users, or reset the password in Supabase → Authentication → Users |
| Sign-in works but you see **"You don't have access"** | Your account has no role | A super administrator assigns a role in Settings → Users |
| Invitation / reset email never arrives | No SMTP provider, or Supabase rate limit | Configure SMTP (README step 3.6), or use the one-time-password option |
| Invite link says "invalid or expired" | The email template still uses the default link | Change the templates to `/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (or `recovery`) |
| `admin:bootstrap` says "A super administrator already exists" | By design | Add officers from the app. Use `--force` only to recover a locked-out project. |
| `supabase db push` asks for a password / fails to connect | Database password, or IPv6 network | Use the password from project creation, or run `npx supabase link` again |
| Import: "This does not look like a CSV or Excel file" | Wrong file, or a PDF/HTML export | Export CSV from PIN again |
| Import: "Old .xls files are not supported" | Legacy Excel format | Open in Excel → Save As → `.xlsx` or CSV |
| Import: columns not detected | PIN changed its export headers | Map them in Step 2 of the wizard (the mapping is per file) |
| Import: everyone is **Unmatched** | Members have no email in the hub, or the export uses personal emails | Add emails on member pages (old emails keep matching), or link the scans from the review queue, which can save the email for next time |
| Import: rows show **Unmapped event** | The PIN title isn't attached to an event | Pick the event in Step 3 and tick *Remember this PIN name* |
| Totals look too low | The event has no category, is archived, or the semester's policy doesn't count that category | Check the event's category and the policy (Settings → Policies) |
| Member shows **No email** | No email on file | Add one on their page. The zeros are a data gap, not absence |
| "Approved policies are immutable" | By design | Create a new draft version |
| "No approved policy covers this action" | The strike/probation policy is still a draft | Approve a policy first, or record an authorized override with a reason |
| Migration preview shows mismatches | The workbook's cached values differ from its own log (usually the file wasn't recalculated) | The app's numbers come from the attendance log. Official statuses are never changed by this |
| Rollback refused: "data created after the migration depends on it" | Imports or edits happened after the migration | Expected safeguard. Fix records individually instead |
| `npm run test:db` skips every test | `TEST_DATABASE_URL` not set or local Supabase not running | `npx supabase start`, then rerun |
| Port 3000 in use | Another dev server | `npx next dev -p 3001` (and add that URL to the Supabase redirect URLs) |
