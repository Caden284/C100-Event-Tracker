-- =============================================================================
-- Excused / unexcused absences and policy-based strike suggestions.
--
--   * Officers record an absence for a member at an event: EXCUSED (with a
--     reason such as illness, work, class or a mental health day) or
--     UNEXCUSED. The reason lives in absence_excuses, readable only by
--     officers who record excuses or read private member notes; other
--     officers just see "Excused".
--   * An excused absence never counts as attendance. Under the policy it only
--     protects the member from a strike for that event (up to a per-semester cap).
--   * Strike suggestions are calculated in the app from the semester's policy.
--     An officer confirms (creates a strike_records row tied to the trigger) or
--     dismisses each one with a reason; neither happens automatically.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permission and role grants
-- ---------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('attendance.excuse', 'Attendance', 'Record excused and unexcused absences, including the reason');

insert into public.role_permissions (role_key, permission_key) values
  ('secretary', 'attendance.excuse'),
  ('president', 'attendance.excuse');

-- ---------------------------------------------------------------------------
-- Attendance statuses: switch "Excused" on, make "Absent" explicitly unexcused.
-- "excused" is never taken from a PIN export: it needs a reason, so it is only
-- recorded through record_absence().
-- ---------------------------------------------------------------------------
update public.attendance_statuses set is_active = true, pin_aliases = '{}', name = 'Excused absence' where key = 'excused';
update public.attendance_statuses set name = 'Absent (unexcused)' where key = 'absent';

-- ---------------------------------------------------------------------------
-- Absence reasons (configurable in Settings)
-- ---------------------------------------------------------------------------
create table public.absence_reasons (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  requires_note boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.absence_reasons is 'Reasons an officer can pick when recording an excused absence.';

insert into public.absence_reasons (key, name, description, requires_note, sort_order) values
  ('illness',        'Under the weather / illness',      'Sick or not feeling well. Do not record medical details.', false, 1),
  ('work',           'Work shift',                        'Scheduled to work at the time of the event.', false, 2),
  ('class',          'Class, lab or exam',                'Academic conflict at the time of the event.', false, 3),
  ('mental_health',  'Mental health day',                 'Taking care of themselves. No explanation required.', false, 4),
  ('family',         'Family obligation or emergency',    null, false, 5),
  ('religious',      'Religious observance',              null, false, 6),
  ('university',     'University commitment',             'Athletics, a required program or another official GSU commitment.', false, 7),
  ('transportation', 'Transportation issue',              null, false, 8),
  ('other',          'Other',                             'Anything else. A short note is required.', true, 9);

-- ---------------------------------------------------------------------------
-- Excuse details, one per excused attendance record
-- ---------------------------------------------------------------------------
create table public.absence_excuses (
  attendance_record_id uuid primary key references public.attendance_records (id) on delete cascade,
  reason_key text not null references public.absence_reasons (key) on update cascade,
  note text check (note is null or length(note) <= 500),
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
comment on table public.absence_excuses is 'Why an absence was excused. Visible only to officers who record excuses or read private member notes.';

-- "Excused" may only be set through record_absence(), which always stores a reason.
create or replace function public.guard_excused_status()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if new.status_key = 'excused'
     and (tg_op = 'INSERT' or old.status_key is distinct from 'excused')
     and coalesce(current_setting('app.recording_excuse', true), '') <> 'on' then
    raise exception 'Record excused absences with "Record an absence" so the reason is saved';
  end if;
  return new;
end $$;
create trigger attendance_records_excused_guard before insert or update of status_key on public.attendance_records
  for each row execute function public.guard_excused_status();

-- When a record stops being "excused" (e.g. the member actually checked in),
-- its excuse no longer applies.
create or replace function public.clear_stale_excuse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status_key = 'excused' and new.status_key <> 'excused' then
    delete from public.absence_excuses where attendance_record_id = new.id;
  end if;
  return new;
end $$;
create trigger attendance_records_clear_excuse after update of status_key on public.attendance_records
  for each row execute function public.clear_stale_excuse();

-- Record (or change) an absence for a member at an event.
create or replace function public.record_absence(
  p_event uuid, p_person uuid, p_excused boolean, p_reason text default null, p_note text default null)
returns uuid language plpgsql as $$
declare
  v_id uuid; v_old text; v_attended boolean; v_requires_note boolean;
  v_status text := case when p_excused then 'excused' else 'absent' end;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_permission('attendance.excuse');
  if not exists (select 1 from public.members where person_id = p_person) then
    raise exception 'Absences are recorded for members only';
  end if;
  if not exists (select 1 from public.events where id = p_event and archived_at is null) then
    raise exception 'Event not found';
  end if;
  if p_excused then
    select requires_note into v_requires_note from public.absence_reasons where key = p_reason and is_active;
    if not found then raise exception 'Choose a reason for the excused absence'; end if;
    if v_requires_note and v_note is null then raise exception 'Add a short note for this reason'; end if;
  end if;

  select ar.id, ar.status_key, s.counts_as_attended into v_id, v_old, v_attended
  from public.attendance_records ar join public.attendance_statuses s on s.key = ar.status_key
  where ar.event_id = p_event and ar.person_id = p_person;
  if v_attended then
    raise exception 'This member is recorded as attending this event. Correct that record first if it is wrong.';
  end if;

  perform set_config('app.recording_excuse', 'on', true);
  if v_id is null then
    insert into public.attendance_records (event_id, person_id, status_key, source, change_reason)
    values (p_event, p_person, v_status, 'manual', case when p_excused then 'Excused absence recorded' else 'Unexcused absence recorded' end)
    returning id into v_id;
  elsif v_old is distinct from v_status then
    update public.attendance_records
       set status_key = v_status,
           change_reason = case when p_excused then 'Absence marked excused' else 'Absence marked unexcused' end
     where id = v_id;
  end if;
  perform set_config('app.recording_excuse', 'off', true);

  if p_excused then
    insert into public.absence_excuses (attendance_record_id, reason_key, note)
    values (v_id, p_reason, v_note)
    on conflict (attendance_record_id) do update
      set reason_key = excluded.reason_key, note = excluded.note, recorded_by = auth.uid(), recorded_at = now();
  else
    delete from public.absence_excuses where attendance_record_id = v_id;
  end if;
  return v_id;
end $$;

-- Excuse recorders may write absence records without holding attendance.write.
create policy attendance_absence_insert on public.attendance_records for insert to authenticated
  with check ((select public.perm('attendance.excuse')) and status_key in ('excused', 'absent') and source = 'manual');
create policy attendance_absence_update on public.attendance_records for update to authenticated
  using ((select public.perm('attendance.excuse')) and status_key in ('excused', 'absent', 'registered'))
  with check ((select public.perm('attendance.excuse')) and status_key in ('excused', 'absent'));

-- The generic manual-entry path must not create excused records without a reason.
create or replace function public.set_manual_attendance(
  p_event uuid, p_person uuid, p_status text, p_reason text default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_old text;
begin
  perform public.require_permission('attendance.write');
  if p_status = 'excused' then
    raise exception 'Use "Record an absence" to excuse an absence, so the reason is saved';
  end if;
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

-- PIN files can't set "excused" (it needs a reason). Same classifier as before,
-- except such rows are flagged for the officer instead of being imported.
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
      elsif v_status = 'excused' then
        v_status := null;
        v_outcome := 'invalid'; v_msg := 'Excused absences need a reason: record them with "Record an absence", not from a PIN file';
      end if;
    else
      select s.key into v_status from public.attendance_statuses s
      where s.is_active and (lower(btrim(r.status_raw)) = any (s.pin_aliases) or lower(btrim(r.status_raw)) = s.key
                             or lower(btrim(r.status_raw)) = lower(s.name))
      order by s.sort_order limit 1;
      if v_status = 'excused' then
        v_status := null;
        v_outcome := 'invalid'; v_msg := format('"%s": excused absences need a reason, so they are recorded with "Record an absence", not from a PIN file', r.status_raw);
      elsif v_status is null then
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
-- Strike suggestions: confirmed strikes remember which trigger produced them,
-- and dismissed suggestions are recorded so they are not suggested again.
-- ---------------------------------------------------------------------------
alter table public.strike_records add column trigger_key text check (trigger_key is null or length(trigger_key) <= 120);
alter table public.strike_records add column event_id uuid references public.events (id) on delete set null;
alter table public.strike_records drop constraint strike_records_source_check;
alter table public.strike_records add constraint strike_records_source_check
  check (source in ('manual', 'workbook_migration', 'policy_suggestion'));
create unique index strike_records_trigger_uniq on public.strike_records (member_id, semester_id, trigger_key)
  where trigger_key is not null;

create table public.strike_dismissals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete cascade,
  trigger_key text not null check (length(trigger_key) <= 120),
  reason text not null check (length(btrim(reason)) >= 5),
  dismissed_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (member_id, semester_id, trigger_key)
);
comment on table public.strike_dismissals is 'Strike suggestions an officer decided not to confirm, with the reason.';

-- ---------------------------------------------------------------------------
-- Row Level Security, auditing
-- ---------------------------------------------------------------------------
alter table public.absence_reasons enable row level security;
alter table public.absence_excuses enable row level security;
alter table public.strike_dismissals enable row level security;

create policy absence_reasons_select on public.absence_reasons for select to authenticated using ((select public.is_officer()));
create policy absence_reasons_insert on public.absence_reasons for insert to authenticated with check ((select public.perm('settings.manage')));
create policy absence_reasons_update on public.absence_reasons for update to authenticated
  using ((select public.perm('settings.manage'))) with check ((select public.perm('settings.manage')));

create policy absence_excuses_select on public.absence_excuses for select to authenticated
  using ((select public.perm('attendance.excuse')) or (select public.perm('members.notes')));
create policy absence_excuses_insert on public.absence_excuses for insert to authenticated with check ((select public.perm('attendance.excuse')));
create policy absence_excuses_update on public.absence_excuses for update to authenticated
  using ((select public.perm('attendance.excuse'))) with check ((select public.perm('attendance.excuse')));
create policy absence_excuses_delete on public.absence_excuses for delete to authenticated using ((select public.perm('attendance.excuse')));

create policy strike_dismissals_select on public.strike_dismissals for select to authenticated using ((select public.perm('discipline.read')));
create policy strike_dismissals_insert on public.strike_dismissals for insert to authenticated with check ((select public.perm('discipline.propose')));
create policy strike_dismissals_delete on public.strike_dismissals for delete to authenticated using ((select public.perm('discipline.propose')));

create trigger audit_absence_reasons after insert or update or delete on public.absence_reasons
  for each row execute function public.audit_row_change();
create trigger audit_absence_excuses after insert or update or delete on public.absence_excuses
  for each row execute function public.audit_row_change();
create trigger audit_strike_dismissals after insert or update or delete on public.strike_dismissals
  for each row execute function public.audit_row_change();

grant select, insert, update on public.absence_reasons to authenticated;
grant select, insert, update, delete on public.absence_excuses to authenticated;
grant select, insert, delete on public.strike_dismissals to authenticated;
grant execute on function public.record_absence(uuid, uuid, boolean, text, text) to authenticated;
revoke execute on function public.record_absence(uuid, uuid, boolean, text, text) from anon, public;
revoke execute on function public.guard_excused_status() from anon, public;
revoke execute on function public.clear_stale_excuse() from anon, public;
