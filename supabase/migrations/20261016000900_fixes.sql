-- =============================================================================
-- Fixes found by the database test-suite.
-- =============================================================================

-- 1. assign_policy_to_semester() (SECURITY INVOKER) records its decision in
--    policy_approvals; officers allowed to assign policies must be able to insert
--    their own approval rows.
create policy policy_approvals_insert on public.policy_approvals for insert to authenticated
  with check (actor_id = auth.uid() and ((select public.perm('semesters.manage')) or (select public.perm('policies.approve'))));

-- 2. Workbook migration: match Attendance Log rows to events of the semester being
--    migrated first, so an identically named event in another semester is never used.
create or replace function public.wb_find_event(p_pin text, p_date date, p_semester uuid)
returns uuid language plpgsql stable as $$
declare v uuid[];
begin
  select array_agg(distinct ev.id) into v from public.event_pin_names n join public.events ev on ev.id = n.event_id
  where n.pin_name_normalized = public.norm_text(p_pin) and ev.semester_id = p_semester;
  if coalesce(array_length(v, 1), 0) = 0 then
    select array_agg(distinct ev.id) into v from public.event_pin_names n join public.events ev on ev.id = n.event_id
    where n.pin_name_normalized = public.norm_text(p_pin);
  end if;
  if coalesce(array_length(v, 1), 0) > 1 then
    select array_agg(ev.id) into v from public.events ev where ev.id = any (v) and ev.event_date = p_date;
  end if;
  return case when coalesce(array_length(v, 1), 0) = 1 then v[1] end;
end $$;
grant execute on function public.wb_find_event(text, date, uuid) to authenticated;
revoke execute on function public.wb_find_event(text, date, uuid) from anon, public;

create or replace function public.commit_workbook_migration(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_run uuid;
  v_sem uuid;
  v_sem_created boolean := false;
  v_policy uuid;
  v_policy_created boolean := false;
  e jsonb; pp jsonb; a jsonb; u jsonb;
  v_event uuid; v_person uuid; v_member uuid; v_cands uuid[];
  v_email text;
  v_status text;
  v_warn jsonb := coalesce(p -> 'warnings', '[]'::jsonb);
  c_events_new int := 0; c_events_existing int := 0;
  c_people_new int := 0; c_people_existing int := 0;
  c_members_new int := 0; c_prospects_new int := 0;
  c_att_new int := 0; c_att_dup int := 0; c_att_unresolved int := 0;
  c_unmatched_new int := 0; c_cards int := 0; c_notes int := 0; c_dues int := 0;
  v_summary jsonb;
begin
  perform public.require_permission('data.migrate');
  perform set_config('app.bulk_operation', 'on', true);

  insert into public.migration_runs (file_name, file_sha256)
  values (p ->> 'file_name', p ->> 'file_sha256') returning id into v_run;

  -- Semester -----------------------------------------------------------------
  select id into v_sem from public.semesters where name = p -> 'semester' ->> 'name';
  if v_sem is null then
    insert into public.semesters (name, term, academic_year, start_date, end_date, dues_deadline, status, notes)
    values (p -> 'semester' ->> 'name', p -> 'semester' ->> 'term', p -> 'semester' ->> 'academic_year',
            (p -> 'semester' ->> 'start_date')::date, (p -> 'semester' ->> 'end_date')::date,
            nullif(p -> 'semester' ->> 'dues_deadline', '')::date,
            case when not exists (select 1 from public.semesters where status = 'active')
                  and current_date between (p -> 'semester' ->> 'start_date')::date and (p -> 'semester' ->> 'end_date')::date
                 then 'active' else 'upcoming' end,
            'Created by workbook migration')
    returning id into v_sem;
    v_sem_created := true;
  end if;

  -- Policy (always a DRAFT: workbook values are not automatically chapter-approved)
  select id into v_policy from public.membership_policies
  where source = 'workbook_migration' and effective_semester_id = v_sem order by version desc limit 1;
  if v_policy is null then
    insert into public.membership_policies (name, version, status, rules, summary, source, effective_semester_id, migration_run_id)
    values (coalesce(p -> 'policy' ->> 'name', 'Membership standards'), 1 + coalesce((select max(version) from public.membership_policies
              where name = coalesce(p -> 'policy' ->> 'name', 'Membership standards')), 0),
            'draft', p -> 'policy' -> 'rules', p -> 'policy' ->> 'summary', 'workbook_migration', v_sem, v_run)
    returning id into v_policy;
    v_policy_created := true;
    if (select policy_id from public.semesters where id = v_sem) is null then
      perform set_config('app.policy_assignment', 'on', true);
      update public.semesters set policy_id = v_policy where id = v_sem;
      perform set_config('app.policy_assignment', 'off', true);
    end if;
  end if;

  -- Events -------------------------------------------------------------------
  for e in select * from jsonb_array_elements(coalesce(p -> 'events', '[]')) loop
    select id into v_event from public.events where legacy_key = e ->> 'legacy_key';
    if v_event is null then
      insert into public.events (semester_id, name, event_date, start_time, end_time, time_note, location, category_key,
        notes, planning_status, attendance_source, series_key, legacy_key, migration_run_id)
      values (v_sem, e ->> 'name', nullif(e ->> 'event_date', '')::date, nullif(e ->> 'start_time', '')::time,
        nullif(e ->> 'end_time', '')::time, nullif(e ->> 'time_note', ''), nullif(e ->> 'location', ''),
        nullif(e ->> 'category_key', ''), nullif(e ->> 'notes', ''), coalesce(e ->> 'planning_status', 'proposed'),
        coalesce(e ->> 'attendance_source', 'pin'), nullif(e ->> 'series_key', ''), e ->> 'legacy_key', v_run)
      returning id into v_event;
      c_events_new := c_events_new + 1;
    else
      c_events_existing := c_events_existing + 1;
    end if;
    if coalesce(e ->> 'pin_name', '') <> '' then
      insert into public.event_pin_names (event_id, pin_name, is_primary)
      values (v_event, e ->> 'pin_name', not exists (select 1 from public.event_pin_names where event_id = v_event and is_primary))
      on conflict (event_id, pin_name_normalized) do nothing;
    end if;
    v_event := null;
  end loop;

  -- People (members first, then prospects) -------------------------------------
  for pp in select * from jsonb_array_elements(coalesce(p -> 'people', '[]'))
            order by case when value ->> 'kind' = 'member' then 0 else 1 end loop
    v_person := null;
    v_email := public.norm_email(pp ->> 'email');
    if v_email is not null and public.is_valid_email(v_email) then
      select person_id into v_person from public.person_identifiers where kind = 'email' and value_normalized = v_email;
    end if;
    if v_person is null then
      select id into v_person from public.people where legacy_key = pp ->> 'legacy_key';
    end if;

    if v_person is null then
      insert into public.people (first_name, last_name, legacy_key, migration_run_id)
      values (nullif(btrim(pp ->> 'first_name'), ''), nullif(btrim(pp ->> 'last_name'), ''), pp ->> 'legacy_key', v_run)
      returning id into v_person;
      c_people_new := c_people_new + 1;
      if v_email is not null and public.is_valid_email(v_email) then
        insert into public.person_identifiers (person_id, kind, value, is_primary, source, migration_run_id)
        values (v_person, 'email', v_email, true, 'workbook', v_run);
      elsif coalesce(btrim(pp ->> 'email'), '') <> '' then
        insert into public.person_identifiers (person_id, kind, value, source, migration_run_id)
        values (v_person, 'placeholder', btrim(pp ->> 'email'), 'workbook', v_run)
        on conflict (kind, value_normalized) do nothing;
      end if;
    else
      c_people_existing := c_people_existing + 1;
    end if;

    if pp ->> 'kind' = 'member' then
      select id into v_member from public.members where person_id = v_person;
      if v_member is null then
        select key into v_status from public.member_statuses where key = pp ->> 'status_key';
        insert into public.members (person_id, status_key, eboard_role, committee, legacy_strikes, legacy_key, migration_run_id, change_reason)
        values (v_person, coalesce(v_status, 'not_verified'), nullif(pp ->> 'eboard_role', ''), nullif(pp ->> 'committee', ''),
                nullif(pp ->> 'strikes', '')::int, pp ->> 'legacy_key', v_run, 'Imported from workbook')
        returning id into v_member;
        c_members_new := c_members_new + 1;
        if coalesce(pp ->> 'notes', '') <> '' then
          insert into public.member_notes (member_id, body, source, migration_run_id)
          values (v_member, pp ->> 'notes', 'workbook', v_run);
          c_notes := c_notes + 1;
        end if;
        if pp ->> 'dues_paid' in ('Y', 'N') then
          insert into public.member_dues (member_id, semester_id, status, note)
          values (v_member, v_sem, case when pp ->> 'dues_paid' = 'Y' then 'paid' else 'unpaid' end, 'Imported from workbook')
          on conflict (member_id, semester_id) do nothing;
          c_dues := c_dues + 1;
        end if;
      end if;
      v_member := null; v_status := null;
    else
      if not exists (select 1 from public.prospective_members where person_id = v_person) then
        insert into public.prospective_members (person_id, semester_id, first_seen_text, first_seen_event_id, status,
          legacy_converted_flag, converted_member_id, notes, legacy_key, migration_run_id)
        select v_person, v_sem, nullif(pp ->> 'first_seen', ''),
               (select n.event_id from public.event_pin_names n join public.events ev on ev.id = n.event_id
                 where n.pin_name_normalized = public.norm_text(pp ->> 'first_seen') and ev.semester_id = v_sem limit 1),
               case when m.id is not null then 'converted' else 'in_recruitment' end,
               nullif(pp ->> 'converted', ''), m.id, nullif(pp ->> 'notes', ''), pp ->> 'legacy_key', v_run
        from (select 1) one left join public.members m on m.person_id = v_person;
        c_prospects_new := c_prospects_new + 1;
      end if;
    end if;
  end loop;

  -- Attendance log -------------------------------------------------------------
  for a in select * from jsonb_array_elements(coalesce(p -> 'attendance', '[]')) loop
    v_event := null; v_person := null;
    v_event := public.wb_find_event(a ->> 'pin_event_name', nullif(a ->> 'event_date', '')::date, v_sem);

    v_email := public.norm_email(a ->> 'email');
    if v_email is not null and public.is_valid_email(v_email) then
      select person_id into v_person from public.person_identifiers where kind = 'email' and value_normalized = v_email;
    elsif v_email is not null then
      select person_id into v_person from public.person_identifiers where kind = 'placeholder' and value_normalized = public.norm_text(a ->> 'email');
    end if;

    if v_event is null or v_person is null then
      insert into public.unmatched_scans (source, first_name, last_name, email, card_id, pin_event_name, event_id, event_date,
        status_key, reason, details, suggestions, legacy_key, migration_run_id)
      values ('workbook', a ->> 'first_name', a ->> 'last_name', a ->> 'email', a ->> 'card_id', a ->> 'pin_event_name', v_event,
        nullif(a ->> 'event_date', '')::date, coalesce(a ->> 'status_key', 'attended'),
        case when v_event is null then 'unmapped_event' when v_email is null then 'no_email' else 'no_match' end,
        'Attendance Log row ' || coalesce(a ->> 'row', '?') || ' could not be matched during migration',
        public.suggest_people(a ->> 'first_name', a ->> 'last_name'), 'wb:log:' || (a ->> 'legacy_key'), v_run)
      on conflict (legacy_key) do nothing;
      c_att_unresolved := c_att_unresolved + 1;
    else
      insert into public.attendance_records (event_id, person_id, status_key, source, pin_event_name, source_first_name,
        source_last_name, source_email, source_card_id, source_marked_by, source_marked_on, migration_run_id)
      values (v_event, v_person, coalesce(a ->> 'status_key', 'attended'), 'workbook_migration', a ->> 'pin_event_name',
        a ->> 'first_name', a ->> 'last_name', a ->> 'email', a ->> 'card_id', a ->> 'marked_by', a ->> 'marked_on', v_run)
      on conflict on constraint attendance_one_per_person_event do nothing;
      if found then c_att_new := c_att_new + 1; else c_att_dup := c_att_dup + 1; end if;
      if public.is_reliable_card_id(a ->> 'card_id') then
        insert into public.person_identifiers (person_id, kind, value, source, migration_run_id)
        values (v_person, 'card_id', btrim(a ->> 'card_id'), 'workbook', v_run)
        on conflict (kind, value_normalized) do nothing;
        if found then c_cards := c_cards + 1; end if;
      end if;
    end if;
    v_cands := null;
  end loop;

  -- Unmatched Scans tab ----------------------------------------------------------
  for u in select * from jsonb_array_elements(coalesce(p -> 'unmatched', '[]')) loop
    select ev.id into v_event from public.events ev
    where ev.semester_id = v_sem and (public.norm_text(ev.name) = public.norm_text(u ->> 'event')
          or exists (select 1 from public.event_pin_names n where n.event_id = ev.id and n.pin_name_normalized = public.norm_text(u ->> 'event')))
    limit 1;
    insert into public.unmatched_scans (source, first_name, last_name, email, pin_event_name, event_id, event_date, status_key,
      reason, details, suggestions, legacy_key, migration_run_id)
    values ('workbook', u ->> 'first_name', u ->> 'last_name',
      case when public.is_valid_email(public.norm_email(u ->> 'email')) then u ->> 'email' end,
      u ->> 'event', v_event, nullif(u ->> 'date', '')::date, 'attended', 'workbook_unmatched',
      concat_ws(' — ', nullif(u ->> 'email', ''), u ->> 'action'),
      public.suggest_people(u ->> 'first_name', u ->> 'last_name'), 'wb:unmatched:' || (u ->> 'legacy_key'), v_run)
    on conflict (legacy_key) do nothing;
    if found then c_unmatched_new := c_unmatched_new + 1; end if;
    v_event := null;
  end loop;

  v_summary := jsonb_build_object(
    'run_id', v_run, 'semester_id', v_sem, 'semester_created', v_sem_created,
    'policy_id', v_policy, 'policy_created', v_policy_created,
    'events_created', c_events_new, 'events_existing', c_events_existing,
    'people_created', c_people_new, 'people_existing', c_people_existing,
    'members_created', c_members_new, 'prospects_created', c_prospects_new,
    'member_notes_created', c_notes, 'dues_records_created', c_dues,
    'attendance_created', c_att_new, 'attendance_already_present', c_att_dup,
    'attendance_unresolved', c_att_unresolved, 'unmatched_scans_created', c_unmatched_new,
    'card_ids_recorded', c_cards);
  update public.migration_runs set summary = v_summary, warnings = v_warn where id = v_run;
  perform set_config('app.bulk_operation', 'off', true);
  perform public.log_audit('workbook_migration.commit', 'migration_runs', v_run::text, null, v_summary);
  return v_summary;
end $$;


-- 3. Migration rollback runs as the officer, so it needs narrowly scoped DELETE
--    policies: only rows created by a migration run, only with data.migrate.
do $$
declare t text;
begin
  foreach t in array array['people', 'members', 'prospective_members', 'events', 'unmatched_scans', 'member_notes'] loop
    execute format('create policy %I on public.%I for delete to authenticated using (migration_run_id is not null and (select public.perm(''data.migrate'')))', t || '_migration_delete', t);
  end loop;
end $$;
create policy membership_policies_migration_delete on public.membership_policies for delete to authenticated
  using (migration_run_id is not null and status = 'draft' and (select public.perm('data.migrate')));
create policy semesters_migration_delete on public.semesters for delete to authenticated
  using ((select public.is_super_admin()) and not exists (select 1 from public.events e where e.semester_id = semesters.id));
create policy member_dues_migration_delete on public.member_dues for delete to authenticated
  using ((select public.perm('data.migrate')) and note = 'Imported from workbook');

-- Undo a migration run. Refuses if anything created later depends on it.
create or replace function public.rollback_workbook_migration(p_run uuid, p_reason text)
returns jsonb language plpgsql as $$
declare v_run public.migration_runs; v_blockers jsonb; v_sem uuid;
begin
  perform public.require_permission('data.migrate');
  if not public.is_super_admin() then raise exception 'Only a super administrator can roll back a migration' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 5 then raise exception 'A reason is required'; end if;
  select * into v_run from public.migration_runs where id = p_run for update;
  if v_run.id is null or v_run.status <> 'committed' then raise exception 'Migration run not found or already rolled back'; end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'later_attendance', nullif((select count(*) from public.attendance_records ar
        where (ar.person_id in (select id from public.people where migration_run_id = p_run)
            or ar.event_id in (select id from public.events where migration_run_id = p_run))
          and ar.migration_run_id is distinct from p_run), 0),
    'conversions', nullif((select count(*) from public.prospective_members where migration_run_id = p_run and status = 'converted' and converted_at is not null), 0),
    'recognition', nullif((select count(*) from public.recognition_nominations where nominee_person_id in (select id from public.people where migration_run_id = p_run))
                        + (select count(*) from public.recognition_results where person_id in (select id from public.people where migration_run_id = p_run)), 0),
    'points', nullif((select count(*) from public.point_transactions where person_id in (select id from public.people where migration_run_id = p_run)), 0),
    'discipline', nullif((select count(*) from public.disciplinary_actions where member_id in (select id from public.members where migration_run_id = p_run))
                       + (select count(*) from public.strike_records where member_id in (select id from public.members where migration_run_id = p_run)), 0)
  )) into v_blockers;
  if v_blockers <> '{}'::jsonb then
    raise exception 'Cannot roll back: data created after the migration depends on it: %', v_blockers;
  end if;

  perform set_config('app.bulk_operation', 'on', true);
  delete from public.unmatched_scans where migration_run_id = p_run;
  delete from public.attendance_records where migration_run_id = p_run;
  delete from public.prospective_members where migration_run_id = p_run;
  delete from public.members where migration_run_id = p_run;
  delete from public.people where migration_run_id = p_run;
  delete from public.events where migration_run_id = p_run;
  v_sem := (v_run.summary ->> 'semester_id')::uuid;
  if (v_run.summary ->> 'policy_created')::boolean then
    perform set_config('app.policy_assignment', 'on', true);
    update public.semesters set policy_id = null where policy_id = (v_run.summary ->> 'policy_id')::uuid;
    perform set_config('app.policy_assignment', 'off', true);
    delete from public.membership_policies where id = (v_run.summary ->> 'policy_id')::uuid and status = 'draft';
  end if;
  if (v_run.summary ->> 'semester_created')::boolean
     and not exists (select 1 from public.events where semester_id = v_sem) then
    delete from public.member_dues where semester_id = v_sem;
    delete from public.semesters where id = v_sem;
  end if;
  -- Verify nothing was silently skipped (e.g. by Row Level Security).
  if exists (select 1 from public.people where migration_run_id = p_run)
     or exists (select 1 from public.events where migration_run_id = p_run)
     or exists (select 1 from public.attendance_records where migration_run_id = p_run) then
    raise exception 'Rollback could not remove every record of this run; nothing was changed.';
  end if;
  update public.migration_runs set status = 'rolled_back', rolled_back_by = auth.uid(), rolled_back_at = now() where id = p_run;
  perform set_config('app.bulk_operation', 'off', true);
  perform public.log_audit('workbook_migration.rollback', 'migration_runs', p_run::text, p_reason, v_run.summary);
  return jsonb_build_object('rolled_back', p_run);
end $$;

