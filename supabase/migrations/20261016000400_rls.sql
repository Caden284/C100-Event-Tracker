-- =============================================================================
-- C100 Membership Hub — Row Level Security
--
-- Pattern: `(select public.has_permission('x'))` is wrapped in a sub-select so
-- Postgres evaluates it once per query rather than once per row.
-- The anon role is granted nothing. Every policy targets `authenticated`.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- (not FORCE: SECURITY DEFINER helpers owned by the database owner must be able to read)
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The audit log is append-only for everyone using the API.
revoke update, delete on public.audit_logs from authenticated;
revoke insert on public.audit_logs from authenticated;

-- Helper macro-ish function to keep the policy list readable.
create or replace function public.perm(p text) returns boolean
language sql stable security definer set search_path = public as $$ select public.has_permission(p) $$;
grant execute on function public.perm(text) to authenticated;

-- ---------------------------------------------------------------- accounts
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.is_officer()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or (select public.perm('users.manage')))
  with check (id = auth.uid() or (select public.perm('users.manage')));

create policy roles_select on public.roles for select to authenticated using ((select public.is_officer()));
create policy roles_write on public.roles for all to authenticated
  using ((select public.perm('users.manage'))) with check ((select public.perm('users.manage')));
create policy permissions_select on public.permissions for select to authenticated using ((select public.is_officer()));
create policy role_permissions_select on public.role_permissions for select to authenticated using ((select public.is_officer()));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or (select public.is_officer()));
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check ((select public.perm('users.manage')));
create policy user_roles_delete on public.user_roles for delete to authenticated
  using ((select public.perm('users.manage')));

create policy audit_select on public.audit_logs for select to authenticated using ((select public.perm('audit.read')));

create policy app_settings_select on public.app_settings for select to authenticated using ((select public.is_officer()));
create policy app_settings_write on public.app_settings for all to authenticated
  using ((select public.perm('settings.manage'))) with check ((select public.perm('settings.manage')));

-- ---------------------------------------------------------------- reference data
create policy semesters_select on public.semesters for select to authenticated using ((select public.is_officer()));
create policy semesters_write on public.semesters for insert to authenticated with check ((select public.perm('semesters.manage')));
create policy semesters_update on public.semesters for update to authenticated
  using ((select public.perm('semesters.manage'))) with check ((select public.perm('semesters.manage')));

do $$
declare t text;
begin
  foreach t in array array['event_categories', 'member_statuses', 'attendance_statuses'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_officer()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.perm(''settings.manage'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.perm(''settings.manage''))) with check ((select public.perm(''settings.manage'')))', t || '_update', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- events
create policy events_select on public.events for select to authenticated using ((select public.perm('events.read')));
create policy events_insert on public.events for insert to authenticated with check ((select public.perm('events.write')));
create policy events_update on public.events for update to authenticated
  using ((select public.perm('events.write'))) with check ((select public.perm('events.write')));
create policy event_pin_names_select on public.event_pin_names for select to authenticated using ((select public.perm('events.read')));
create policy event_pin_names_write on public.event_pin_names for all to authenticated
  using ((select public.perm('events.write')) or (select public.perm('attendance.import')))
  with check ((select public.perm('events.write')) or (select public.perm('attendance.import')));

-- ---------------------------------------------------------------- people
create policy people_select on public.people for select to authenticated
  using ((select public.perm('members.read')) or (select public.perm('prospects.read')) or (select public.perm('attendance.read')));
create policy people_insert on public.people for insert to authenticated
  with check ((select public.perm('members.write')) or (select public.perm('prospects.write'))
              or (select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')));
create policy people_update on public.people for update to authenticated
  using ((select public.perm('members.write')) or (select public.perm('prospects.write')))
  with check ((select public.perm('members.write')) or (select public.perm('prospects.write')));

create policy person_identifiers_select on public.person_identifiers for select to authenticated
  using ((select public.perm('members.read')) or (select public.perm('prospects.read')) or (select public.perm('attendance.read')));
create policy person_identifiers_write on public.person_identifiers for all to authenticated
  using ((select public.perm('members.write')) or (select public.perm('prospects.write'))
         or (select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')))
  with check ((select public.perm('members.write')) or (select public.perm('prospects.write'))
              or (select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')));

-- ---------------------------------------------------------------- members
create policy members_select on public.members for select to authenticated using ((select public.perm('members.read')));
create policy members_insert on public.members for insert to authenticated
  with check ((select public.perm('members.write')) or (select public.perm('prospects.convert')));
create policy members_update on public.members for update to authenticated
  using ((select public.perm('members.write'))) with check ((select public.perm('members.write')));
create policy member_status_history_select on public.member_status_history for select to authenticated
  using ((select public.perm('members.read')));
create policy member_notes_select on public.member_notes for select to authenticated using ((select public.perm('members.notes')));
create policy member_notes_insert on public.member_notes for insert to authenticated
  with check ((select public.perm('members.notes')) and (select public.perm('members.write')));
create policy member_notes_delete on public.member_notes for delete to authenticated
  using (created_by = auth.uid() and (select public.perm('members.notes')));
create policy member_dues_select on public.member_dues for select to authenticated using ((select public.perm('dues.read')));
create policy member_dues_write on public.member_dues for all to authenticated
  using ((select public.perm('dues.write'))) with check ((select public.perm('dues.write')));

-- ---------------------------------------------------------------- prospects
create policy prospects_select on public.prospective_members for select to authenticated using ((select public.perm('prospects.read')));
create policy prospects_insert on public.prospective_members for insert to authenticated
  with check ((select public.perm('prospects.write')) or (select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')));
create policy prospects_update on public.prospective_members for update to authenticated
  using ((select public.perm('prospects.write')) or (select public.perm('prospects.convert')))
  with check ((select public.perm('prospects.write')) or (select public.perm('prospects.convert')));

-- ---------------------------------------------------------------- attendance
create policy attendance_select on public.attendance_records for select to authenticated using ((select public.perm('attendance.read')));
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check ((select public.perm('attendance.write')) or (select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')));
create policy attendance_update on public.attendance_records for update to authenticated
  using ((select public.perm('attendance.write')) or (select public.perm('attendance.import')))
  with check ((select public.perm('attendance.write')) or (select public.perm('attendance.import')));
create policy attendance_delete on public.attendance_records for delete to authenticated
  using ((select public.perm('attendance.write')));

create policy imports_select on public.attendance_imports for select to authenticated using ((select public.perm('attendance.read')));
create policy imports_write on public.attendance_imports for insert to authenticated with check ((select public.perm('attendance.import')));
create policy imports_update on public.attendance_imports for update to authenticated
  using ((select public.perm('attendance.import'))) with check ((select public.perm('attendance.import')));
create policy import_rows_select on public.attendance_import_rows for select to authenticated using ((select public.perm('attendance.read')));
create policy import_rows_write on public.attendance_import_rows for all to authenticated
  using ((select public.perm('attendance.import'))) with check ((select public.perm('attendance.import')));

create policy unmatched_select on public.unmatched_scans for select to authenticated using ((select public.perm('attendance.read')));
create policy unmatched_insert on public.unmatched_scans for insert to authenticated
  with check ((select public.perm('attendance.import')) or (select public.perm('unmatched.resolve')));
create policy unmatched_update on public.unmatched_scans for update to authenticated
  using ((select public.perm('unmatched.resolve'))) with check ((select public.perm('unmatched.resolve')));

create policy migration_runs_select on public.migration_runs for select to authenticated using ((select public.perm('data.migrate')));
create policy migration_runs_write on public.migration_runs for all to authenticated
  using ((select public.perm('data.migrate'))) with check ((select public.perm('data.migrate')));

-- ---------------------------------------------------------------- policies & standing
create policy policies_select on public.membership_policies for select to authenticated using ((select public.perm('policies.read')) or (select public.perm('standing.read')));
create policy policies_insert on public.membership_policies for insert to authenticated with check ((select public.perm('policies.write')));
create policy policies_update on public.membership_policies for update to authenticated
  using ((select public.perm('policies.write')) or (select public.perm('policies.approve')))
  with check ((select public.perm('policies.write')) or (select public.perm('policies.approve')));
create policy policy_approvals_select on public.policy_approvals for select to authenticated using ((select public.perm('policies.read')));

create policy strikes_select on public.strike_records for select to authenticated using ((select public.perm('discipline.read')));
create policy strikes_insert on public.strike_records for insert to authenticated with check ((select public.perm('discipline.propose')));
create policy strikes_update on public.strike_records for update to authenticated
  using ((select public.perm('discipline.propose'))) with check ((select public.perm('discipline.propose')));

create policy discipline_select on public.disciplinary_actions for select to authenticated using ((select public.perm('discipline.read')));
create policy discipline_insert on public.disciplinary_actions for insert to authenticated with check ((select public.perm('discipline.propose')));
create policy discipline_update on public.disciplinary_actions for update to authenticated
  using ((select public.perm('discipline.propose')) or (select public.perm('discipline.approve')))
  with check ((select public.perm('discipline.propose')) or (select public.perm('discipline.approve')));

-- ---------------------------------------------------------------- recognition
create policy rec_categories_select on public.recognition_categories for select to authenticated using ((select public.perm('recognition.read')));
create policy rec_categories_write on public.recognition_categories for all to authenticated
  using ((select public.perm('recognition.manage'))) with check ((select public.perm('recognition.manage')));
create policy rec_periods_select on public.recognition_periods for select to authenticated using ((select public.perm('recognition.read')));
create policy rec_periods_write on public.recognition_periods for all to authenticated
  using ((select public.perm('recognition.manage'))) with check ((select public.perm('recognition.manage')));
create policy rec_nominations_select on public.recognition_nominations for select to authenticated using ((select public.perm('recognition.read')));
create policy rec_nominations_insert on public.recognition_nominations for insert to authenticated
  with check ((select public.perm('recognition.nominate')) and nominated_by = auth.uid());
create policy rec_nominations_delete on public.recognition_nominations for delete to authenticated
  using (nominated_by = auth.uid() or (select public.perm('recognition.manage')));
-- Ballots: a voter sees only their own. Tallies come from recognition_vote_tally().
create policy rec_votes_select on public.recognition_votes for select to authenticated using (voter_id = auth.uid());
create policy rec_votes_insert on public.recognition_votes for insert to authenticated
  with check ((select public.perm('recognition.vote')) and voter_id = auth.uid());
create policy rec_votes_delete on public.recognition_votes for delete to authenticated using (voter_id = auth.uid());
create policy rec_results_select on public.recognition_results for select to authenticated
  using ((is_official and (select public.perm('recognition.read'))) or (select public.perm('recognition.manage')) or (select public.perm('recognition.approve')));
create policy rec_results_write on public.recognition_results for all to authenticated
  using ((select public.perm('recognition.manage')) or (select public.perm('recognition.approve')))
  with check ((select public.perm('recognition.manage')) or (select public.perm('recognition.approve')));

-- ---------------------------------------------------------------- points
create policy point_rules_select on public.point_rules for select to authenticated using ((select public.perm('points.read')));
create policy point_rules_write on public.point_rules for all to authenticated
  using ((select public.perm('points.manage')) or (select public.perm('policies.approve')))
  with check ((select public.perm('points.manage')) or (select public.perm('policies.approve')));
create policy point_tx_select on public.point_transactions for select to authenticated using ((select public.perm('points.read')));
create policy point_tx_insert on public.point_transactions for insert to authenticated with check ((select public.perm('points.award')));

-- ---------------------------------------------------------------- notifications
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());
create policy notification_prefs_select on public.notification_preferences for select to authenticated using ((select public.is_officer()));
create policy notification_prefs_write on public.notification_preferences for all to authenticated
  using ((select public.perm('users.manage'))) with check ((select public.perm('users.manage')));
