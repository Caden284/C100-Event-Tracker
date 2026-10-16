-- =============================================================================
-- C100 Membership Hub — Core domain
-- Semesters, event categories, events, people & identities, members,
-- prospective members, attendance, PIN imports and the unmatched-scan queue.
--
-- Key design decisions
--   * A PERSON has one stable id (people.id) that never depends on name or email.
--     Members and prospective members are roles a person holds. Converting a
--     prospect to a member keeps the same person, so no history is duplicated.
--   * Emails and PIN card ids live in person_identifiers. Old emails are kept
--     (is_primary = false) so future PIN exports still match the right person.
--   * attendance_records has UNIQUE (event_id, person_id): the database itself
--     guarantees that re-uploading a PIN export can never double-count anyone.
--   * Totals (meetings attended, standing…) are NOT stored. They are derived from
--     attendance_records at read time, so they can never go stale.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Semesters
-- ---------------------------------------------------------------------------
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  term text not null check (term in ('Fall', 'Spring', 'Summer')),
  academic_year text not null check (academic_year ~ '^\d{4}-\d{4}$'),
  start_date date not null,
  end_date date not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'archived')),
  policy_id uuid,               -- FK added after membership_policies exists
  dues_deadline date,
  notes text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index semesters_single_active on public.semesters ((true)) where status = 'active';

-- ---------------------------------------------------------------------------
-- Event categories (Meeting, General, Service, Mentoring, Study, Recruitment…)
-- How a category counts toward requirements is defined in the versioned
-- membership policy, not here, so changing it is always a recorded decision.
-- ---------------------------------------------------------------------------
create table public.event_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  is_recruitment boolean not null default false,
  is_legacy boolean not null default false,
  color text not null default 'slate',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semesters (id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  event_date date,                                   -- null = date TBD
  start_time time,
  end_time time,
  time_note text,                                    -- e.g. 'Time TBD', '12:00 PM – until'
  location text,
  category_key text references public.event_categories (key) on update cascade,
  description text,
  notes text,
  planning_status text not null default 'proposed'
    check (planning_status in ('proposed', 'confirmed', 'pending_approval', 'cancelled')),
  attendance_source text not null default 'pin'
    check (attendance_source in ('pin', 'paper', 'mixed', 'none')),
  -- Chapter-approved exception to the category's counting rule.
  -- null = use the category; a category key = count as that category; 'none' = count toward nothing.
  counting_override text,
  counting_override_reason text,
  counting_override_approved_by uuid references public.profiles (id) on delete set null,
  counting_override_approved_at timestamptz,
  series_key text,                                   -- groups recurring events (e.g. weekly study block)
  archived_at timestamptz,
  legacy_key text unique,                            -- workbook-migration idempotency key
  migration_run_id uuid,
  change_reason text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (counting_override is null or counting_override_reason is not null)
);
create index events_semester_idx on public.events (semester_id, event_date);
create index events_date_idx on public.events (event_date);

-- Exact PIN event names (and aliases) used to match attendance exports.
create table public.event_pin_names (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  pin_name text not null check (length(btrim(pin_name)) > 0),
  pin_name_normalized text generated always as (public.norm_text(pin_name)) stored,
  is_primary boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, pin_name_normalized)
);
create index event_pin_names_norm_idx on public.event_pin_names (pin_name_normalized);
create unique index event_pin_names_one_primary on public.event_pin_names (event_id) where is_primary;

-- ---------------------------------------------------------------------------
-- People & identifiers
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  preferred_name text,
  legacy_key text unique,
  migration_run_id uuid,
  change_reason text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(btrim(first_name), '') <> '' or coalesce(btrim(last_name), '') <> '')
);
create index people_name_idx on public.people (lower(last_name), lower(first_name));

create table public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('email', 'card_id', 'placeholder')),
  value text not null,
  value_normalized text generated always as (
    case when kind = 'email' then public.norm_email(value) else public.norm_text(value) end
  ) stored,
  is_primary boolean not null default false,
  source text not null default 'manual' check (source in ('workbook', 'pin_import', 'manual', 'conversion')),
  retired_at timestamptz,   -- set when an email is replaced; still used for matching history
  migration_run_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, value_normalized),
  check (kind <> 'email' or public.is_valid_email(value))
);
create index person_identifiers_person_idx on public.person_identifiers (person_id);
create unique index person_identifiers_one_primary_email
  on public.person_identifiers (person_id) where kind = 'email' and is_primary;

-- Convenience: a person's current primary email (or null).
create or replace function public.primary_email(p_person uuid)
returns text language sql stable as $$
  select value from public.person_identifiers
  where person_id = p_person and kind = 'email' and is_primary
  limit 1
$$;

create or replace function public.person_name(p_first text, p_last text, p_preferred text default null)
returns text language sql immutable as $$
  select btrim(coalesce(nullif(btrim(p_preferred), ''), coalesce(p_first, '')) || ' ' || coalesce(p_last, ''))
$$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create table public.member_statuses (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  counts_as_active boolean not null default false,
  is_tracked boolean not null default true,   -- evaluated for attendance standards?
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people (id) on delete restrict,
  status_key text not null default 'not_verified' references public.member_statuses (key) on update cascade,
  eboard_role text,
  committee text,
  member_since date,            -- null = legacy/unknown: all attendance counts
  joined_semester_id uuid references public.semesters (id) on delete set null,
  converted_from_prospect_id uuid,
  status_changed_at timestamptz,
  legacy_strikes int check (legacy_strikes between 0 and 10),  -- value preserved from the workbook (historical)
  legacy_key text unique,
  migration_run_id uuid,
  change_reason text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_status_idx on public.members (status_key);

create table public.member_status_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  changed_by uuid default auth.uid() references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index member_status_history_member_idx on public.member_status_history (member_id, changed_at desc);

create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  source text not null default 'manual' check (source in ('manual', 'workbook')),
  migration_run_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index member_notes_member_idx on public.member_notes (member_id, created_at desc);

create table public.member_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete restrict,
  status text not null check (status in ('paid', 'unpaid', 'partial', 'waived')),
  amount_cents int check (amount_cents >= 0),
  paid_on date,
  note text,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, semester_id)
);

-- Membership-status changes must carry a reason and are written to history.
create or replace function public.track_member_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
    return new;
  end if;
  if new.status_key is distinct from old.status_key then
    if not public.is_privileged() and coalesce(btrim(new.change_reason), '') = '' then
      raise exception 'A reason is required to change membership status';
    end if;
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create or replace function public.log_member_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status_key is distinct from old.status_key then
    insert into public.member_status_history (member_id, from_status, to_status, reason, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status_key end, new.status_key,
            coalesce(new.change_reason, case when tg_op = 'INSERT' then 'Record created' end), auth.uid());
  end if;
  return new;
end $$;

create trigger members_status_guard before insert or update on public.members
  for each row execute function public.track_member_status();
create trigger members_status_log after insert or update of status_key on public.members
  for each row execute function public.log_member_status();

-- ---------------------------------------------------------------------------
-- Prospective members ("Perspectives" — people going through recruitment)
-- ---------------------------------------------------------------------------
create table public.prospective_members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people (id) on delete restrict,
  semester_id uuid references public.semesters (id) on delete set null,
  first_seen_event_id uuid references public.events (id) on delete set null,
  first_seen_text text,
  status text not null default 'in_recruitment'
    check (status in ('in_recruitment', 'converted', 'withdrawn', 'not_eligible')),
  interest_override text check (interest_override in ('low', 'medium', 'high')),
  follow_up_status text not null default 'not_contacted'
    check (follow_up_status in ('not_contacted', 'contacted', 'interested', 'follow_up_later', 'not_interested')),
  assigned_officer_id uuid references public.profiles (id) on delete set null,
  next_steps text,
  notes text,
  legacy_converted_flag text,
  converted_member_id uuid references public.members (id) on delete set null,
  converted_at timestamptz,
  converted_by uuid references public.profiles (id) on delete set null,
  legacy_key text unique,
  migration_run_id uuid,
  change_reason text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prospective_members_status_idx on public.prospective_members (status);

alter table public.members
  add constraint members_converted_from_fk foreign key (converted_from_prospect_id)
  references public.prospective_members (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance_statuses (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  counts_as_attended boolean not null default false,
  is_active boolean not null default true,
  pin_aliases text[] not null default '{}',     -- lower-case values seen in PIN exports
  sort_order int not null default 0
);

create table public.attendance_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text not null,
  file_size int not null,
  file_type text not null check (file_type in ('csv', 'xlsx')),
  sheet_name text,
  headers text[] not null default '{}',
  row_count int not null default 0,
  column_mapping jsonb not null default '{}',
  default_status_key text references public.attendance_statuses (key),
  event_resolution jsonb not null default '{}',
  row_decisions jsonb not null default '{}',
  status text not null default 'preview' check (status in ('preview', 'committed', 'cancelled', 'failed')),
  semester_id uuid references public.semesters (id) on delete set null,
  is_complete_roster boolean not null default false,
  reconcile_absent boolean not null default false,
  create_prospects_for_unmatched boolean not null default false,
  summary jsonb not null default '{}',
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  committed_by uuid references public.profiles (id) on delete set null,
  committed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not reconcile_absent or is_complete_roster)
);
create index attendance_imports_created_idx on public.attendance_imports (created_at desc);
create index attendance_imports_sha_idx on public.attendance_imports (file_sha256);

create table public.attendance_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.attendance_imports (id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  first_name text,
  last_name text,
  email text,
  email_normalized text,
  card_id text,
  pin_event_name text,
  event_date date,
  event_date_raw text,
  status_raw text,
  status_key text references public.attendance_statuses (key),
  marked_by text,
  marked_on text,
  group_key text,
  event_id uuid references public.events (id) on delete set null,
  person_id uuid references public.people (id) on delete set null,
  person_type text check (person_type in ('member', 'prospect', 'unmatched')),
  match_method text check (match_method in ('email', 'card_id', 'manual', 'none')),
  outcome text check (outcome in ('new', 'duplicate', 'conflict', 'unmatched', 'unmapped_event',
                                   'invalid', 'deferred', 'replaced', 'kept_existing', 'created_prospect')),
  message text,
  fingerprint text not null,
  attendance_record_id uuid,
  unique (import_id, row_number)
);
create index attendance_import_rows_import_idx on public.attendance_import_rows (import_id, outcome);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  person_id uuid not null references public.people (id) on delete restrict,
  status_key text not null references public.attendance_statuses (key) on update cascade,
  source text not null check (source in ('pin_import', 'manual', 'workbook_migration', 'unmatched_resolution')),
  import_id uuid references public.attendance_imports (id) on delete set null,
  import_row_id uuid references public.attendance_import_rows (id) on delete set null,
  pin_event_name text,
  source_first_name text,
  source_last_name text,
  source_email text,
  source_card_id text,
  source_marked_by text,
  source_marked_on text,
  migration_run_id uuid,
  change_reason text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- THE deduplication guarantee: one attendance record per person per event.
  constraint attendance_one_per_person_event unique (event_id, person_id)
);
create index attendance_records_person_idx on public.attendance_records (person_id);
create index attendance_records_import_idx on public.attendance_records (import_id);

alter table public.attendance_import_rows
  add constraint attendance_import_rows_record_fk foreign key (attendance_record_id)
  references public.attendance_records (id) on delete set null;

-- Corrections to existing attendance must say why.
create or replace function public.guard_attendance_change()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() then return new; end if;
  if tg_op = 'UPDATE' and (new.status_key is distinct from old.status_key
                           or new.person_id is distinct from old.person_id
                           or new.event_id is distinct from old.event_id)
     and coalesce(btrim(new.change_reason), '') = '' then
    raise exception 'A reason is required to correct an attendance record';
  end if;
  return new;
end $$;
create trigger attendance_records_guard before update on public.attendance_records
  for each row execute function public.guard_attendance_change();

-- ---------------------------------------------------------------------------
-- Unmatched scans review queue
-- ---------------------------------------------------------------------------
create table public.unmatched_scans (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.attendance_imports (id) on delete set null,
  import_row_id uuid references public.attendance_import_rows (id) on delete set null,
  source text not null default 'pin_import' check (source in ('pin_import', 'workbook', 'manual')),
  first_name text,
  last_name text,
  email text,
  card_id text,
  pin_event_name text,
  event_id uuid references public.events (id) on delete set null,
  event_date date,
  status_key text references public.attendance_statuses (key),
  reason text not null check (reason in ('no_email', 'no_match', 'ambiguous', 'placeholder_email',
                                         'unmapped_event', 'identifier_conflict', 'workbook_unmatched')),
  details text,
  suggestions jsonb not null default '[]',
  resolution_status text not null default 'open'
    check (resolution_status in ('open', 'linked', 'created_prospect', 'created_member', 'duplicate', 'dismissed')),
  resolution_note text,
  resolved_person_id uuid references public.people (id) on delete set null,
  attendance_record_id uuid references public.attendance_records (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  legacy_key text unique,
  migration_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolution_status not in ('dismissed', 'duplicate') or coalesce(btrim(resolution_note), '') <> '')
);
create index unmatched_scans_open_idx on public.unmatched_scans (resolution_status, created_at desc);
-- An import row lands in the queue at most once (makes commits idempotent).
create unique index unmatched_scans_import_row_uniq on public.unmatched_scans (import_row_id) where import_row_id is not null;

-- ---------------------------------------------------------------------------
-- Workbook migration runs
-- ---------------------------------------------------------------------------
create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text not null,
  status text not null default 'committed' check (status in ('committed', 'rolled_back')),
  summary jsonb not null default '{}',
  warnings jsonb not null default '[]',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  rolled_back_by uuid references public.profiles (id) on delete set null,
  rolled_back_at timestamptz
);

-- ---------------------------------------------------------------------------
-- touch + audit triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['semesters','event_categories','events','people','members','member_dues',
                           'prospective_members','attendance_imports','attendance_records','unmatched_scans']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_row()', t || '_touch', t);
  end loop;
  foreach t in array array['semesters','event_categories','events','event_pin_names','people','person_identifiers',
                           'members','member_notes','member_dues','member_statuses','prospective_members',
                           'attendance_statuses','attendance_records','unmatched_scans','migration_runs']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', 'audit_' || t, t);
  end loop;
end $$;
-- attendance_imports: audit status changes only (rows are too noisy to log individually)
create trigger audit_attendance_imports after update of status on public.attendance_imports
  for each row execute function public.audit_row_change();
