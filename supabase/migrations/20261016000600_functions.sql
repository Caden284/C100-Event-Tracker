-- =============================================================================
-- C100 Membership Hub — Transactional workflows (called from the app via RPC)
--
-- Every function here is SECURITY INVOKER: it runs with the caller's own
-- permissions, so Row Level Security still applies to every statement, and it
-- checks the required permission up front to give a clear error.
-- A single function call is a single transaction: if anything fails, nothing
-- is written.
-- =============================================================================

create or replace function public.require_permission(p text)
returns void language plpgsql stable as $$
begin
  if not public.has_permission(p) then
    raise exception 'Permission denied: % is required', p using errcode = '42501';
  end if;
end $$;

-- A PIN card id is only trusted as an identifier when it looks like a real
-- Panther ID (digits). Placeholders such as 'MANUAL' are ignored.
create or replace function public.is_reliable_card_id(t text)
returns boolean language sql immutable as $$ select coalesce(btrim(t) ~ '^\d{6,12}$', false) $$;

create or replace function public.person_type_of(p_person uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from public.members m where m.person_id = p_person) then 'member'
    when exists (select 1 from public.prospective_members pm where pm.person_id = p_person) then 'prospect'
    else 'unmatched' end
$$;

-- Name-based suggestions for the review queue. These are SUGGESTIONS ONLY:
-- nothing is ever linked automatically on a name.
create or replace function public.suggest_people(p_first text, p_last text, p_limit int default 5)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(s order by s.score desc, s.name), '[]'::jsonb) from (
    select p.id as person_id, public.person_name(p.first_name, p.last_name) as name,
           public.primary_email(p.id) as email, public.person_type_of(p.id) as type,
           (case when public.norm_text(p.last_name) = public.norm_text(p_last) then 2 else 0 end
            + case when public.norm_text(p.first_name) = public.norm_text(p_first) then 1 else 0 end) as score
    from public.people p
    where (public.norm_text(p_last) is not null and public.norm_text(p.last_name) = public.norm_text(p_last))
       or (public.norm_text(p_first) is not null and public.norm_text(p.first_name) = public.norm_text(p_first))
    order by score desc
    limit p_limit
  ) s
$$;

-- ---------------------------------------------------------------------------
-- PIN import: classify every row (no attendance is written here)
-- ---------------------------------------------------------------------------
create or replace function public.classify_attendance_import(p_import uuid)
returns jsonb language plpgsql as $$
declare
  v_imp public.attendance_imports;
  r record;
  v_status text;
  v_event uuid;
  v_res jsonb;
  v_cands uuid[];
  v_person uuid;
  v_method text;
  v_outcome text;
  v_msg text;
  v_existing record;
  v_prev int;
  v_card_person uuid;
  v_summary jsonb;
begin
  perform public.require_permission('attendance.import');
  select * into v_imp from public.attendance_imports where id = p_import for update;
  if v_imp.id is null then raise exception 'Import not found'; end if;
  if v_imp.status <> 'preview' then raise exception 'This import has already been %', v_imp.status; end if;

  for r in select * from public.attendance_import_rows where import_id = p_import order by row_number loop
    v_status := null; v_event := null; v_person := null; v_method := 'none'; v_outcome := null; v_msg := null;

    -- 1. status ---------------------------------------------------------------
    if r.status_raw is null or btrim(r.status_raw) = '' then
      v_status := v_imp.default_status_key;
      if v_status is null then
        v_outcome := 'invalid'; v_msg := 'No attendance status in the file and no default status was chosen';
      end if;
    else
      select s.key into v_status from public.attendance_statuses s
      where s.is_active and (lower(btrim(r.status_raw)) = any (s.pin_aliases) or lower(btrim(r.status_raw)) = s.key
                             or lower(btrim(r.status_raw)) = lower(s.name))
      order by s.sort_order limit 1;
      if v_status is null then
        v_outcome := 'invalid'; v_msg := format('Unrecognized attendance status "%s"', r.status_raw);
      end if;
    end if;

    -- 2. event ----------------------------------------------------------------
    v_res := v_imp.event_resolution -> r.group_key;
    if v_res is not null and v_res ->> 'action' = 'map' then
      v_event := (v_res ->> 'event_id')::uuid;
    elsif v_res is not null and v_res ->> 'action' = 'defer' then
      v_outcome := coalesce(v_outcome, 'deferred');
      v_msg := coalesce(v_msg, 'Event deferred for review by the importing officer');
    else
      if r.pin_event_name is not null then
        select array_agg(distinct e.id) into v_cands
        from public.event_pin_names n join public.events e on e.id = n.event_id
        where n.pin_name_normalized = public.norm_text(r.pin_event_name) and e.archived_at is null;
        if coalesce(array_length(v_cands, 1), 0) > 1 and r.event_date is not null then
          select array_agg(e.id) into v_cands from public.events e
          where e.id = any (v_cands) and e.event_date = r.event_date;
        end if;
        if coalesce(array_length(v_cands, 1), 0) = 1 then
          v_event := v_cands[1];
        end if;
      end if;
      if v_event is null then
        v_outcome := coalesce(v_outcome, 'unmapped_event');
        v_msg := coalesce(v_msg, case when r.pin_event_name is null then 'No event name in this row'
                                      else format('PIN event "%s" is not mapped to an event', r.pin_event_name) end);
      end if;
    end if;
    if r.event_date_raw is not null and r.event_date is null then
      v_msg := coalesce(v_msg || '; ', '') || format('Could not read date "%s"', r.event_date_raw);
    end if;

    -- 3. person -----------------------------------------------------------------
    if r.email_normalized is not null and public.is_valid_email(r.email_normalized) then
      select pi.person_id into v_person from public.person_identifiers pi
      where pi.kind = 'email' and pi.value_normalized = r.email_normalized;
      if v_person is not null then
        v_method := 'email';
      elsif public.is_reliable_card_id(r.card_id) then
        select pi.person_id into v_card_person from public.person_identifiers pi
        where pi.kind = 'card_id' and pi.value_normalized = public.norm_text(r.card_id);
        if v_card_person is not null then
          v_outcome := coalesce(v_outcome, 'unmatched');
          v_msg := coalesce(v_msg, 'Card ID belongs to an existing person but the email is different. Review before linking.');
        end if;
      end if;
    elsif public.is_reliable_card_id(r.card_id) then
      select pi.person_id into v_person from public.person_identifiers pi
      where pi.kind = 'card_id' and pi.value_normalized = public.norm_text(r.card_id);
      if v_person is not null then v_method := 'card_id'; end if;
    end if;
    if v_person is null then
      v_outcome := coalesce(v_outcome, 'unmatched');
      v_msg := coalesce(v_msg, case
        when r.email is null or btrim(r.email) = '' then 'No email address — needs manual review'
        when not public.is_valid_email(r.email_normalized) then format('"%s" is not a valid email — needs manual review', r.email)
        else 'Email is not on the member or prospective-member lists' end);
    end if;

    -- 4. duplicates & conflicts ------------------------------------------------
    if v_outcome is null then
      select ir.row_number into v_prev from public.attendance_import_rows ir
      where ir.import_id = p_import and ir.row_number < r.row_number
        and ir.event_id = v_event and ir.person_id = v_person and ir.outcome in ('new', 'duplicate', 'conflict')
      order by ir.row_number limit 1;
      if v_prev is not null then
        v_outcome := 'duplicate'; v_msg := format('Same person and event as row %s of this file', v_prev);
      else
        select ar.id, ar.status_key, ar.source into v_existing from public.attendance_records ar
        where ar.event_id = v_event and ar.person_id = v_person;
        if v_existing.id is null then
          v_outcome := 'new';
        elsif v_existing.status_key = v_status then
          v_outcome := 'duplicate'; v_msg := 'Already recorded (' || replace(v_existing.source, '_', ' ') || ')';
        else
          v_outcome := 'conflict';
          v_msg := format('Existing record says "%s", file says "%s"', v_existing.status_key, v_status);
        end if;
      end if;
      v_existing := null;
    end if;

    update public.attendance_import_rows
       set status_key = v_status, event_id = v_event, person_id = v_person,
           person_type = case when v_person is null then 'unmatched' else public.person_type_of(v_person) end,
           match_method = v_method, outcome = v_outcome, message = v_msg
     where id = r.id;
    v_cands := null; v_card_person := null; v_prev := null;
  end loop;

  select jsonb_build_object(
    'total', count(*),
    'valid', count(*) filter (where outcome in ('new', 'duplicate', 'conflict')),
    'new', count(*) filter (where outcome = 'new'),
    'duplicate', count(*) filter (where outcome = 'duplicate'),
    'conflict', count(*) filter (where outcome = 'conflict'),
    'unmatched', count(*) filter (where outcome = 'unmatched'),
    'unmapped_event', count(*) filter (where outcome = 'unmapped_event'),
    'deferred', count(*) filter (where outcome = 'deferred'),
    'invalid', count(*) filter (where outcome = 'invalid'),
    'members', count(*) filter (where person_type = 'member'),
    'prospects', count(*) filter (where person_type = 'prospect'),
    'missing_email', count(*) filter (where email_normalized is null),
    'matched_by_card', count(*) filter (where match_method = 'card_id'))
  into v_summary
  from public.attendance_import_rows where import_id = p_import;

  update public.attendance_imports set summary = v_summary where id = p_import;
  return v_summary;
end $$;

-- ---------------------------------------------------------------------------
-- PIN import: commit
-- ---------------------------------------------------------------------------
create or replace function public.commit_attendance_import(p_import uuid)
returns jsonb language plpgsql as $$
declare
  v_imp public.attendance_imports;
  r record;
  g record;
  v_record uuid;
  v_decision text;
  v_person uuid;
  v_counts jsonb := '{}'::jsonb;
  v_new int := 0; v_dup int := 0; v_replaced int := 0; v_kept int := 0;
  v_queued int := 0; v_created int := 0; v_absent int := 0; v_learned int := 0; v_aliases int := 0;
  v_reason text;
begin
  perform public.require_permission('attendance.import');
  perform public.classify_attendance_import(p_import);
  select * into v_imp from public.attendance_imports where id = p_import for update;

  -- Remember PIN names the officer mapped, so the next export matches automatically.
  for g in select key, value from jsonb_each(v_imp.event_resolution)
           where value ->> 'action' = 'map' and coalesce((value ->> 'remember')::boolean, true)
             and value ->> 'pin_event_name' is not null loop
    insert into public.event_pin_names (event_id, pin_name)
    values ((g.value ->> 'event_id')::uuid, g.value ->> 'pin_event_name')
    on conflict (event_id, pin_name_normalized) do nothing;
    if found then v_aliases := v_aliases + 1; end if;
  end loop;

  for r in select * from public.attendance_import_rows where import_id = p_import order by row_number loop
    if r.outcome = 'new' then
      insert into public.attendance_records (event_id, person_id, status_key, source, import_id, import_row_id,
        pin_event_name, source_first_name, source_last_name, source_email, source_card_id, source_marked_by, source_marked_on)
      values (r.event_id, r.person_id, r.status_key, 'pin_import', p_import, r.id,
        r.pin_event_name, r.first_name, r.last_name, r.email, r.card_id, r.marked_by, r.marked_on)
      on conflict on constraint attendance_one_per_person_event do nothing
      returning id into v_record;
      if v_record is null then
        update public.attendance_import_rows set outcome = 'duplicate', message = 'Recorded by another import moments ago' where id = r.id;
        v_dup := v_dup + 1;
      else
        update public.attendance_import_rows set attendance_record_id = v_record where id = r.id;
        v_new := v_new + 1;
      end if;
      v_record := null;

    elsif r.outcome = 'duplicate' then
      v_dup := v_dup + 1;

    elsif r.outcome = 'conflict' then
      v_decision := coalesce(v_imp.row_decisions ->> r.id::text, 'keep');
      if v_decision = 'replace' then
        update public.attendance_records
           set status_key = r.status_key,
               change_reason = format('Replaced by PIN import "%s" (row %s)', v_imp.file_name, r.row_number)
         where event_id = r.event_id and person_id = r.person_id
         returning id into v_record;
        update public.attendance_import_rows set outcome = 'replaced', attendance_record_id = v_record where id = r.id;
        v_replaced := v_replaced + 1;
      else
        update public.attendance_import_rows set outcome = 'kept_existing' where id = r.id;
        v_kept := v_kept + 1;
      end if;
      v_record := null;

    elsif r.outcome = 'unmatched' and v_imp.create_prospects_for_unmatched
          and r.email_normalized is not null and public.is_valid_email(r.email_normalized)
          and r.event_id is not null and r.status_key is not null
          and not exists (select 1 from public.person_identifiers where kind = 'email' and value_normalized = r.email_normalized)
          and not (public.is_reliable_card_id(r.card_id) and exists (
                   select 1 from public.person_identifiers where kind = 'card_id' and value_normalized = public.norm_text(r.card_id)))
          and (coalesce(btrim(r.first_name), '') <> '' or coalesce(btrim(r.last_name), '') <> '') then
      insert into public.people (first_name, last_name, change_reason)
      values (nullif(btrim(r.first_name), ''), nullif(btrim(r.last_name), ''), 'Created from PIN import')
      returning id into v_person;
      insert into public.person_identifiers (person_id, kind, value, is_primary, source)
      values (v_person, 'email', r.email_normalized, true, 'pin_import');
      insert into public.prospective_members (person_id, semester_id, first_seen_event_id, first_seen_text, notes)
      values (v_person, v_imp.semester_id, r.event_id, r.pin_event_name, format('Added from PIN import "%s"', v_imp.file_name));
      insert into public.attendance_records (event_id, person_id, status_key, source, import_id, import_row_id,
        pin_event_name, source_first_name, source_last_name, source_email, source_card_id, source_marked_by, source_marked_on)
      values (r.event_id, v_person, r.status_key, 'pin_import', p_import, r.id,
        r.pin_event_name, r.first_name, r.last_name, r.email, r.card_id, r.marked_by, r.marked_on)
      on conflict on constraint attendance_one_per_person_event do nothing
      returning id into v_record;
      update public.attendance_import_rows
         set outcome = 'created_prospect', person_id = v_person, person_type = 'prospect', attendance_record_id = v_record
       where id = r.id;
      v_created := v_created + 1;
      v_person := null; v_record := null;

    elsif r.outcome in ('unmatched', 'unmapped_event', 'deferred') then
      v_reason := case
        when r.outcome in ('unmapped_event', 'deferred') then 'unmapped_event'
        when r.email is null or btrim(r.email) = '' then 'no_email'
        when not public.is_valid_email(r.email_normalized) then 'placeholder_email'
        when r.message like 'Card ID belongs%' then 'identifier_conflict'
        else 'no_match' end;
      insert into public.unmatched_scans (import_id, import_row_id, source, first_name, last_name, email, card_id,
        pin_event_name, event_id, event_date, status_key, reason, details, suggestions)
      values (p_import, r.id, 'pin_import', r.first_name, r.last_name, r.email, r.card_id,
        r.pin_event_name, r.event_id, r.event_date, r.status_key, v_reason, r.message,
        public.suggest_people(r.first_name, r.last_name))
      on conflict (import_row_id) where import_row_id is not null do nothing;
      v_queued := v_queued + 1;
    end if;

    -- Learn reliable card ids for people matched by email (helps future exports
    -- that are missing an email). Never overwrite a card id owned by someone else.
    if r.match_method = 'email' and r.person_id is not null and public.is_reliable_card_id(r.card_id) then
      insert into public.person_identifiers (person_id, kind, value, source)
      values (r.person_id, 'card_id', btrim(r.card_id), 'pin_import')
      on conflict (kind, value_normalized) do nothing;
      if found then v_learned := v_learned + 1; end if;
    end if;
  end loop;

  -- Optional complete-roster reconciliation (explicitly confirmed by the officer).
  if v_imp.reconcile_absent and v_imp.is_complete_roster then
    insert into public.attendance_records (event_id, person_id, status_key, source, import_id, change_reason)
    select e.event_id, m.person_id, 'absent', 'pin_import', p_import,
           format('Complete-roster reconciliation from "%s"', v_imp.file_name)
    from (select distinct event_id from public.attendance_import_rows
          where import_id = p_import and event_id is not null) e
    cross join public.members m
    join public.member_statuses ms on ms.key = m.status_key and ms.counts_as_active
    where not exists (select 1 from public.attendance_records ar where ar.event_id = e.event_id and ar.person_id = m.person_id)
    on conflict on constraint attendance_one_per_person_event do nothing;
    get diagnostics v_absent = row_count;
  end if;

  v_counts := v_imp.summary || jsonb_build_object(
    'inserted', v_new, 'duplicates_skipped', v_dup, 'replaced', v_replaced, 'kept_existing', v_kept,
    'queued_for_review', v_queued, 'prospects_created', v_created, 'marked_absent', v_absent,
    'card_ids_learned', v_learned, 'pin_names_remembered', v_aliases);

  update public.attendance_imports
     set status = 'committed', committed_by = auth.uid(), committed_at = now(), summary = v_counts
   where id = p_import;

  if v_queued > 0 then
    perform public.notify_permission('unmatched.resolve', 'unmatched_scans',
      'Scans need review', format('%s scan(s) from "%s" could not be matched automatically.', v_queued, v_imp.file_name),
      '/attendance/unmatched', 'unmatched-open');
  end if;
  perform public.log_audit('attendance_import.commit', 'attendance_imports', p_import::text, null, v_counts);
  return v_counts;
end $$;

-- ---------------------------------------------------------------------------
-- Manual attendance
-- ---------------------------------------------------------------------------
create or replace function public.set_manual_attendance(
  p_event uuid, p_person uuid, p_status text, p_reason text default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_old text;
begin
  perform public.require_permission('attendance.write');
  select id, status_key into v_id, v_old from public.attendance_records where event_id = p_event and person_id = p_person;
  if v_id is null then
    insert into public.attendance_records (event_id, person_id, status_key, source, change_reason)
    values (p_event, p_person, p_status, 'manual', nullif(btrim(p_reason), ''))
    returning id into v_id;
  elsif v_old is distinct from p_status then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'A reason is required to change an existing attendance record';
    end if;
    update public.attendance_records set status_key = p_status, change_reason = p_reason where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_attendance_record(p_id uuid, p_reason text)
returns void language plpgsql as $$
begin
  perform public.require_permission('attendance.write');
  if coalesce(length(btrim(p_reason)), 0) < 5 then
    raise exception 'Please give a reason (at least 5 characters) for removing an attendance record';
  end if;
  perform set_config('app.bulk_operation', 'on', true);
  update public.attendance_records set change_reason = p_reason where id = p_id;
  perform set_config('app.bulk_operation', 'off', true);
  delete from public.attendance_records where id = p_id;
  if not found then raise exception 'Attendance record not found'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Identity: change a person's primary email without creating a duplicate person
-- ---------------------------------------------------------------------------
create or replace function public.set_primary_email(p_person uuid, p_email text, p_reason text default null)
returns void language plpgsql as $$
declare v_norm text := public.norm_email(p_email); v_owner uuid;
begin
  if not (public.has_permission('members.write') or public.has_permission('prospects.write')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if v_norm is null or not public.is_valid_email(v_norm) then
    raise exception 'Please enter a valid email address';
  end if;
  select person_id into v_owner from public.person_identifiers where kind = 'email' and value_normalized = v_norm;
  if v_owner is not null and v_owner <> p_person then
    raise exception 'That email already belongs to another person. Review the records before merging.';
  end if;
  update public.person_identifiers set is_primary = false, retired_at = coalesce(retired_at, now())
   where person_id = p_person and kind = 'email' and is_primary and value_normalized <> v_norm;
  if v_owner is null then
    insert into public.person_identifiers (person_id, kind, value, is_primary, source)
    values (p_person, 'email', v_norm, true, 'manual');
  else
    update public.person_identifiers set is_primary = true, retired_at = null
     where person_id = p_person and kind = 'email' and value_normalized = v_norm;
  end if;
  update public.people set change_reason = coalesce(p_reason, 'Primary email changed') where id = p_person;
end $$;

-- ---------------------------------------------------------------------------
-- Unmatched-scan resolution
-- ---------------------------------------------------------------------------
create or replace function public.resolve_unmatched_scan(
  p_scan uuid, p_action text, p_person uuid default null, p_event uuid default null,
  p_note text default null, p_new jsonb default '{}'::jsonb, p_add_email boolean default true)
returns jsonb language plpgsql as $$
declare
  v_scan public.unmatched_scans;
  v_person uuid := p_person;
  v_event uuid;
  v_record uuid;
  v_status text;
  v_final text;
  v_email text;
begin
  perform public.require_permission('unmatched.resolve');
  select * into v_scan from public.unmatched_scans where id = p_scan for update;
  if v_scan.id is null then raise exception 'Scan not found'; end if;
  if v_scan.resolution_status <> 'open' then raise exception 'This scan has already been resolved'; end if;
  v_event := coalesce(p_event, v_scan.event_id);
  v_status := coalesce(v_scan.status_key, 'attended');
  v_email := public.norm_email(coalesce(p_new ->> 'email', v_scan.email));

  if p_action in ('duplicate', 'dismiss') then
    if coalesce(length(btrim(p_note)), 0) < 3 then raise exception 'A note is required'; end if;
    update public.unmatched_scans set resolution_status = case when p_action = 'dismiss' then 'dismissed' else 'duplicate' end,
      resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now() where id = p_scan;
    return jsonb_build_object('status', p_action);
  end if;

  if v_event is null then raise exception 'Choose the event this scan belongs to'; end if;

  if p_action = 'link' then
    if v_person is null then raise exception 'Choose the person to link'; end if;
    v_final := 'linked';
  elsif p_action in ('create_prospect', 'create_member') then
    if p_action = 'create_member' then perform public.require_permission('members.write'); end if;
    if coalesce(btrim(coalesce(p_new ->> 'first_name', v_scan.first_name)), '') = ''
       and coalesce(btrim(coalesce(p_new ->> 'last_name', v_scan.last_name)), '') = '' then
      raise exception 'A name is required';
    end if;
    insert into public.people (first_name, last_name, change_reason)
    values (nullif(btrim(coalesce(p_new ->> 'first_name', v_scan.first_name)), ''),
            nullif(btrim(coalesce(p_new ->> 'last_name', v_scan.last_name)), ''), 'Created from unmatched scan')
    returning id into v_person;
    if p_action = 'create_prospect' then
      insert into public.prospective_members (person_id, first_seen_event_id, first_seen_text, notes)
      values (v_person, v_event, v_scan.pin_event_name, coalesce(p_note, 'Created from unmatched scan'));
      v_final := 'created_prospect';
    else
      insert into public.members (person_id, status_key, member_since, change_reason)
      values (v_person, coalesce(p_new ->> 'status_key', 'not_verified'), nullif(p_new ->> 'member_since', '')::date,
              coalesce(p_note, 'Created from unmatched scan'));
      v_final := 'created_member';
    end if;
  else
    raise exception 'Unknown action %', p_action;
  end if;

  if p_add_email and v_email is not null and public.is_valid_email(v_email)
     and not exists (select 1 from public.person_identifiers where kind = 'email' and value_normalized = v_email) then
    insert into public.person_identifiers (person_id, kind, value, is_primary, source)
    values (v_person, 'email', v_email,
            not exists (select 1 from public.person_identifiers where person_id = v_person and kind = 'email' and is_primary),
            'manual');
  end if;

  insert into public.attendance_records (event_id, person_id, status_key, source, import_id, import_row_id,
    pin_event_name, source_first_name, source_last_name, source_email, source_card_id, change_reason)
  values (v_event, v_person, v_status, 'unmatched_resolution', v_scan.import_id, v_scan.import_row_id,
    v_scan.pin_event_name, v_scan.first_name, v_scan.last_name, v_scan.email, v_scan.card_id,
    coalesce(p_note, 'Resolved from the unmatched-scan queue'))
  on conflict on constraint attendance_one_per_person_event do nothing
  returning id into v_record;

  update public.unmatched_scans
     set resolution_status = v_final, resolved_person_id = v_person, attendance_record_id = v_record,
         event_id = v_event, resolution_note = coalesce(p_note, resolution_note),
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_scan;
  return jsonb_build_object('status', v_final, 'person_id', v_person, 'attendance_record_id', v_record,
                            'already_recorded', v_record is null);
end $$;

-- ---------------------------------------------------------------------------
-- Prospect → member conversion (same person, history preserved)
-- ---------------------------------------------------------------------------
create or replace function public.convert_prospect_to_member(
  p_prospect uuid, p_member_since date, p_semester uuid, p_status text default 'active', p_reason text default null)
returns uuid language plpgsql as $$
declare v_p public.prospective_members; v_member uuid;
begin
  perform public.require_permission('prospects.convert');
  if coalesce(length(btrim(p_reason)), 0) < 5 then
    raise exception 'Please record how membership was confirmed (at least 5 characters)';
  end if;
  if p_member_since is null then raise exception 'Membership start date is required'; end if;
  select * into v_p from public.prospective_members where id = p_prospect for update;
  if v_p.id is null then raise exception 'Prospective member not found'; end if;
  if v_p.status = 'converted' then raise exception 'Already converted'; end if;
  if exists (select 1 from public.members where person_id = v_p.person_id) then
    raise exception 'This person already has a member record';
  end if;
  insert into public.members (person_id, status_key, member_since, joined_semester_id, converted_from_prospect_id, change_reason)
  values (v_p.person_id, p_status, p_member_since, p_semester, v_p.id, p_reason)
  returning id into v_member;
  update public.prospective_members
     set status = 'converted', converted_member_id = v_member, converted_at = now(), converted_by = auth.uid(),
         change_reason = p_reason
   where id = p_prospect;
  return v_member;
end $$;

-- ---------------------------------------------------------------------------
-- Policy assignment (recorded decision) and semester rollover
-- ---------------------------------------------------------------------------
create or replace function public.assign_policy_to_semester(p_semester uuid, p_policy uuid, p_reason text default null)
returns void language plpgsql as $$
declare v_sem public.semesters; v_pol public.membership_policies;
begin
  if not (public.has_permission('semesters.manage') or public.has_permission('policies.approve')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into v_sem from public.semesters where id = p_semester for update;
  select * into v_pol from public.membership_policies where id = p_policy;
  if v_sem.id is null or (p_policy is not null and v_pol.id is null) then raise exception 'Semester or policy not found'; end if;
  if v_pol.status = 'retired' then raise exception 'Retired policies cannot be assigned'; end if;
  if v_sem.status = 'archived' then
    if not public.has_permission('policies.approve') then
      raise exception 'Only policy approvers can change the policy of an archived semester' using errcode = '42501';
    end if;
    if coalesce(length(btrim(p_reason)), 0) < 10 then
      raise exception 'Changing the policy of a past semester is retroactive. Record the decision (at least 10 characters).';
    end if;
  end if;
  perform set_config('app.policy_assignment', 'on', true);
  update public.semesters set policy_id = p_policy where id = p_semester;
  perform set_config('app.policy_assignment', 'off', true);
  if p_policy is not null then
    insert into public.policy_approvals (policy_id, action, actor_id, semester_id, note)
    values (p_policy, 'applied_to_semester', auth.uid(), p_semester, p_reason);
  end if;
end $$;

create or replace function public.rollover_semester(p_from uuid, p_to uuid, p_reason text default null)
returns jsonb language plpgsql as $$
declare v_from public.semesters; v_to public.semesters; v_warn jsonb := '[]'::jsonb;
begin
  perform public.require_permission('semesters.manage');
  select * into v_from from public.semesters where id = p_from for update;
  select * into v_to from public.semesters where id = p_to for update;
  if v_from.id is null or v_to.id is null then raise exception 'Semester not found'; end if;
  if v_from.status <> 'active' then raise exception '% is not the active semester', v_from.name; end if;
  if v_to.status <> 'upcoming' then raise exception '% must be an upcoming semester', v_to.name; end if;
  if v_to.policy_id is null then
    v_warn := v_warn || '"The new semester has no membership policy assigned yet."'::jsonb;
  elsif (select status from public.membership_policies where id = v_to.policy_id) <> 'approved' then
    v_warn := v_warn || '"The new semester''s policy is still a draft — standing will be labeled as draft."'::jsonb;
  end if;
  update public.semesters set status = 'archived', archived_at = now(),
         notes = concat_ws(E'\n', notes, 'Archived by rollover: ' || coalesce(p_reason, '')) where id = p_from;
  update public.semesters set status = 'active' where id = p_to;
  perform public.log_audit('semester.rollover', 'semesters', p_to::text, p_reason,
    jsonb_build_object('from', v_from.name, 'to', v_to.name, 'warnings', v_warn));
  return jsonb_build_object('archived', v_from.name, 'activated', v_to.name, 'warnings', v_warn);
end $$;

-- ---------------------------------------------------------------------------
-- Points: award from attendance using APPROVED rules only (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.award_points_for_semester(p_semester uuid)
returns int language plpgsql as $$
declare v_count int;
begin
  perform public.require_permission('points.award');
  with eligible as (
    select ar.id as attendance_id, ar.person_id, e.id as event_id, pr.id as rule_id, pr.points,
           pr.max_awards_per_semester, pr.name as rule_name,
           row_number() over (partition by ar.person_id, pr.id order by e.event_date, e.id) as n
    from public.attendance_records ar
    join public.events e on e.id = ar.event_id and e.semester_id = p_semester and e.archived_at is null
    join public.attendance_statuses s on s.key = ar.status_key and s.counts_as_attended
    join public.point_rules pr on pr.status = 'approved'
         and (pr.semester_id is null or pr.semester_id = p_semester)
         and pr.category_key = coalesce(nullif(e.counting_override, 'none'), e.category_key)
         and coalesce(e.counting_override, '') <> 'none'
    where (pr.audience = 'both'
        or (pr.audience = 'member' and exists (select 1 from public.members m where m.person_id = ar.person_id))
        or (pr.audience = 'prospect' and exists (select 1 from public.prospective_members p where p.person_id = ar.person_id)))
  ),
  already as (
    select pt.person_id, pt.rule_id, count(*) as c from public.point_transactions pt
    where pt.semester_id = p_semester and pt.rule_id is not null group by 1, 2
  )
  insert into public.point_transactions (person_id, semester_id, event_id, attendance_record_id, rule_id, points, reason)
  select el.person_id, p_semester, el.event_id, el.attendance_id, el.rule_id, el.points, 'Rule: ' || el.rule_name
  from eligible el
  where el.max_awards_per_semester is null
     or el.n <= el.max_awards_per_semester
  on conflict (attendance_record_id, rule_id) where attendance_record_id is not null and rule_id is not null do nothing;
  get diagnostics v_count = row_count;
  perform public.log_audit('points.award_semester', 'semesters', p_semester::text, null, jsonb_build_object('awarded', v_count));
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Workbook migration (C100_Membership_Tracker.xlsx)
-- The app parses the workbook and sends a JSON payload; this function writes it
-- in ONE transaction. It is idempotent: re-running with the same workbook adds
-- nothing new, and it never overwrites values already in the database.
-- ---------------------------------------------------------------------------
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
    select array_agg(distinct ev.id) into v_cands from public.event_pin_names n join public.events ev on ev.id = n.event_id
    where n.pin_name_normalized = public.norm_text(a ->> 'pin_event_name');
    if coalesce(array_length(v_cands, 1), 0) > 1 then
      select array_agg(ev.id) into v_cands from public.events ev
      where ev.id = any (v_cands) and ev.event_date = nullif(a ->> 'event_date', '')::date;
    end if;
    if coalesce(array_length(v_cands, 1), 0) = 1 then v_event := v_cands[1]; end if;

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
  update public.migration_runs set status = 'rolled_back', rolled_back_by = auth.uid(), rolled_back_at = now() where id = p_run;
  perform set_config('app.bulk_operation', 'off', true);
  perform public.log_audit('workbook_migration.rollback', 'migration_runs', p_run::text, p_reason, v_run.summary);
  return jsonb_build_object('rolled_back', p_run);
end $$;

-- ---------------------------------------------------------------------------
-- Read model: one row per attendance record with everything the standing,
-- dashboard and report calculations need. security_invoker keeps RLS in force.
-- ---------------------------------------------------------------------------
create or replace view public.v_attendance_detail with (security_invoker = true) as
select
  ar.id, ar.event_id, ar.person_id, ar.status_key, ar.source, ar.created_at,
  s.counts_as_attended,
  e.name as event_name, e.event_date, e.semester_id, e.category_key,
  case when e.counting_override = 'none' then null else coalesce(e.counting_override, e.category_key) end as effective_category,
  m.id as member_id, m.member_since, pm.id as prospect_id,
  p.first_name, p.last_name
from public.attendance_records ar
join public.attendance_statuses s on s.key = ar.status_key
join public.events e on e.id = ar.event_id
join public.people p on p.id = ar.person_id
left join public.members m on m.person_id = ar.person_id
left join public.prospective_members pm on pm.person_id = ar.person_id
where e.archived_at is null;

create or replace view public.v_people_directory with (security_invoker = true) as
select p.id as person_id, p.first_name, p.last_name, p.preferred_name,
       public.person_name(p.first_name, p.last_name, p.preferred_name) as display_name,
       public.primary_email(p.id) as email,
       m.id as member_id, m.status_key, m.eboard_role, m.committee, m.member_since,
       pm.id as prospect_id, pm.status as prospect_status
from public.people p
left join public.members m on m.person_id = p.id
left join public.prospective_members pm on pm.person_id = p.id;

grant select on public.v_attendance_detail, public.v_people_directory to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
