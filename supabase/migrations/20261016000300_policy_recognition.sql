-- =============================================================================
-- C100 Membership Hub — Policies, standing, discipline, recognition, points,
-- notifications.
--
-- Critical rule: nothing in this file can turn a DRAFT policy into a chapter
-- decision. Approval requires the policies.approve permission, approved
-- policies are immutable, and formal disciplinary actions under a non-approved
-- policy are only possible through a recorded, reasoned override by someone
-- holding discipline.approve.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Membership policies (versioned)
-- ---------------------------------------------------------------------------
create table public.membership_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  rules jsonb not null,
  summary text,
  source text not null default 'manual' check (source in ('manual', 'workbook_migration')),
  effective_semester_id uuid references public.semesters (id) on delete set null,
  effective_from date,
  effective_to date,
  approval_requested_at timestamptz,
  approval_requested_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  approval_note text,
  retired_by uuid references public.profiles (id) on delete set null,
  retired_at timestamptz,
  migration_run_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version),
  check (jsonb_typeof(rules) = 'object')
);

alter table public.semesters
  add constraint semesters_policy_fk foreign key (policy_id)
  references public.membership_policies (id) on delete set null;

create table public.policy_approvals (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.membership_policies (id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'approval_requested', 'approved', 'retired', 'applied_to_semester')),
  actor_id uuid references public.profiles (id) on delete set null,
  semester_id uuid references public.semesters (id) on delete set null,
  note text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index policy_approvals_policy_idx on public.policy_approvals (policy_id, created_at);

create or replace function public.guard_policy()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New policies must start as drafts';
    end if;
    new.approved_by := null; new.approved_at := null;
    return new;
  end if;

  if old.status = 'retired' then
    raise exception 'Retired policies cannot be changed';
  end if;

  if old.status = 'approved' and (new.rules is distinct from old.rules or new.name is distinct from old.name
                                  or new.version is distinct from old.version) then
    raise exception 'Approved policies are immutable. Create a new draft version instead.';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    if not public.has_permission('policies.approve') then
      raise exception 'You do not have permission to approve policies' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status = 'retired' and old.status <> 'retired' then
    if not public.has_permission('policies.approve') then
      raise exception 'You do not have permission to retire policies' using errcode = '42501';
    end if;
    new.retired_by := auth.uid();
    new.retired_at := now();
  elsif new.status = 'draft' and old.status = 'approved' then
    raise exception 'An approved policy cannot return to draft. Create a new version.';
  else
    -- protect approval metadata from being forged on a draft
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end $$;

create or replace function public.log_policy_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'created';
  elsif new.status = 'approved' and old.status <> 'approved' then v_action := 'approved';
  elsif new.status = 'retired' and old.status <> 'retired' then v_action := 'retired';
  elsif new.approval_requested_at is distinct from old.approval_requested_at and new.approval_requested_at is not null then v_action := 'approval_requested';
  elsif new.rules is distinct from old.rules or new.name is distinct from old.name or new.summary is distinct from old.summary then v_action := 'updated';
  else return new;
  end if;
  insert into public.policy_approvals (policy_id, action, actor_id, note, snapshot)
  values (new.id, v_action, auth.uid(), new.approval_note,
          jsonb_build_object('name', new.name, 'version', new.version, 'status', new.status, 'rules', new.rules));
  return new;
end $$;

create trigger policies_guard before insert or update on public.membership_policies
  for each row execute function public.guard_policy();
create trigger policies_log after insert or update on public.membership_policies
  for each row execute function public.log_policy_change();

-- Assigning a policy to a semester is a recorded decision. Changing the policy of
-- an archived (past) semester is a retroactive change and needs an explicit reason.
create or replace function public.guard_semester_policy()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if new.policy_id is distinct from old.policy_id
     and coalesce(current_setting('app.policy_assignment', true), '') <> 'on' then
    raise exception 'Use assign_policy_to_semester() to change a semester''s policy';
  end if;
  return new;
end $$;
create trigger semesters_policy_guard before update on public.semesters
  for each row execute function public.guard_semester_policy();

-- ---------------------------------------------------------------------------
-- Strikes and formal disciplinary actions
-- ---------------------------------------------------------------------------
create table public.strike_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid references public.semesters (id) on delete set null,
  policy_id uuid references public.membership_policies (id) on delete set null,
  points int not null default 1 check (points <> 0 and points between -3 and 3),
  reason text not null check (length(btrim(reason)) >= 5),
  source text not null default 'manual' check (source in ('manual', 'workbook_migration')),
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  check (voided_at is null or coalesce(btrim(void_reason), '') <> '')
);
create index strike_records_member_idx on public.strike_records (member_id);

create table public.disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid references public.semesters (id) on delete set null,
  policy_id uuid references public.membership_policies (id) on delete set null,
  action_type text not null check (action_type in ('formal_warning', 'probation', 'removal', 'other')),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'active', 'resolved', 'rejected', 'overturned')),
  is_override boolean not null default false,
  override_reason text,
  reason text not null check (length(btrim(reason)) >= 5),
  effective_date date,
  review_date date,
  resolution text,
  appeal_outcome text,
  initiated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_override or coalesce(btrim(override_reason), '') <> '')
);
create index disciplinary_actions_member_idx on public.disciplinary_actions (member_id);

create or replace function public.guard_disciplinary_action()
returns trigger language plpgsql as $$
declare v_policy_status text;
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if not public.has_permission('discipline.propose') then
      raise exception 'You do not have permission to propose disciplinary actions' using errcode = '42501';
    end if;
    if new.status <> 'proposed' then
      raise exception 'Disciplinary actions must start as proposed';
    end if;
    new.initiated_by := auth.uid();
    new.approved_by := null; new.approved_at := null;
    select status into v_policy_status from public.membership_policies where id = new.policy_id;
    if coalesce(v_policy_status, 'none') <> 'approved' then
      -- No approved policy: only an explicit, reasoned override by an approver is allowed.
      if not new.is_override then
        raise exception 'No approved policy covers this action. An authorized override with a written reason is required.';
      end if;
      if not public.has_permission('discipline.approve') then
        raise exception 'Only officers who can approve disciplinary actions may record an override' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.member_id is distinct from old.member_id or new.policy_id is distinct from old.policy_id
     or new.action_type is distinct from old.action_type or new.is_override is distinct from old.is_override then
    raise exception 'Member, policy, action type and override flag cannot be changed after creation';
  end if;
  if new.status is distinct from old.status then
    if not public.has_permission('discipline.approve') then
      raise exception 'You do not have permission to change the status of disciplinary actions' using errcode = '42501';
    end if;
    if new.status in ('approved', 'active') and old.approved_by is null then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
    if new.status in ('resolved', 'overturned', 'rejected') and coalesce(btrim(new.resolution), '') = '' then
      raise exception 'A resolution note is required';
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end $$;

create trigger disciplinary_actions_guard before insert or update on public.disciplinary_actions
  for each row execute function public.guard_disciplinary_action();

-- ---------------------------------------------------------------------------
-- Recognition & awards
-- ---------------------------------------------------------------------------
create table public.recognition_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  audience text not null check (audience in ('member', 'prospect')),
  uses_auto_eligibility boolean not null default true,
  uses_nominations boolean not null default true,
  uses_voting boolean not null default false,
  uses_officer_decision boolean not null default true,
  eligibility_rules jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recognition_periods (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.recognition_categories (id) on delete restrict,
  semester_id uuid not null references public.semesters (id) on delete restrict,
  name text not null,
  status text not null default 'setup'
    check (status in ('setup', 'nominations_open', 'voting_open', 'closed', 'finalized')),
  nomination_closes_at timestamptz,
  voting_closes_at timestamptz,
  anonymous_voting boolean not null default true,
  results_visibility text not null default 'approvers' check (results_visibility in ('approvers', 'officers')),
  max_votes_per_voter int not null default 1 check (max_votes_per_voter between 1 and 10),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  unique (category_id, semester_id, name)
);

create table public.recognition_nominations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.recognition_periods (id) on delete cascade,
  nominee_person_id uuid not null references public.people (id) on delete cascade,
  nominated_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  justification text,
  created_at timestamptz not null default now(),
  unique (period_id, nominee_person_id, nominated_by)
);

create table public.recognition_votes (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.recognition_periods (id) on delete cascade,
  nominee_person_id uuid not null references public.people (id) on delete cascade,
  voter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (period_id, voter_id, nominee_person_id)
);

create table public.recognition_results (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.recognition_periods (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  outcome text not null default 'recipient' check (outcome in ('recipient', 'honorable_mention')),
  is_official boolean not null default false,
  note text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (period_id, person_id)
);

create or replace function public.guard_recognition_nomination()
returns trigger language plpgsql as $$
declare v_period record;
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  select p.status, c.audience, c.uses_nominations into v_period
  from public.recognition_periods p join public.recognition_categories c on c.id = p.category_id
  where p.id = new.period_id;
  if not v_period.uses_nominations then raise exception 'This award does not use nominations'; end if;
  if v_period.status <> 'nominations_open' then raise exception 'Nominations are not open for this award'; end if;
  if v_period.audience = 'member' and not exists (select 1 from public.members where person_id = new.nominee_person_id) then
    raise exception 'This award is for members only';
  end if;
  if v_period.audience = 'prospect' and not exists (select 1 from public.prospective_members where person_id = new.nominee_person_id) then
    raise exception 'This award is for prospective members only';
  end if;
  new.nominated_by := auth.uid();
  return new;
end $$;
create trigger recognition_nominations_guard before insert on public.recognition_nominations
  for each row execute function public.guard_recognition_nomination();

create or replace function public.guard_recognition_vote()
returns trigger language plpgsql as $$
declare v_period record; v_count int;
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  select p.status, p.max_votes_per_voter, c.uses_voting, c.uses_nominations into v_period
  from public.recognition_periods p join public.recognition_categories c on c.id = p.category_id
  where p.id = new.period_id;
  if not v_period.uses_voting then raise exception 'This award does not use voting'; end if;
  if v_period.status <> 'voting_open' then raise exception 'Voting is not open for this award'; end if;
  if v_period.uses_nominations and not exists (
    select 1 from public.recognition_nominations where period_id = new.period_id and nominee_person_id = new.nominee_person_id) then
    raise exception 'You can only vote for nominated candidates';
  end if;
  new.voter_id := auth.uid();
  select count(*) into v_count from public.recognition_votes where period_id = new.period_id and voter_id = auth.uid();
  if v_count >= v_period.max_votes_per_voter then
    raise exception 'You have already used all of your votes for this award';
  end if;
  return new;
end $$;
create trigger recognition_votes_guard before insert on public.recognition_votes
  for each row execute function public.guard_recognition_vote();

create or replace function public.guard_recognition_result()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if new.is_official and (tg_op = 'INSERT' or not old.is_official) then
    if not public.has_permission('recognition.approve') then
      raise exception 'Only an authorized officer can make a recognition result official' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif tg_op = 'UPDATE' and old.is_official and not new.is_official then
    if not public.has_permission('recognition.approve') then
      raise exception 'Only an authorized officer can withdraw an official result' using errcode = '42501';
    end if;
    new.approved_by := null; new.approved_at := null;
  elsif tg_op = 'UPDATE' then
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  end if;
  return new;
end $$;
create trigger recognition_results_guard before insert or update on public.recognition_results
  for each row execute function public.guard_recognition_result();

-- Vote tallies without exposing who voted for whom.
create or replace function public.recognition_vote_tally(p_period uuid)
returns table (nominee_person_id uuid, votes bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_period record;
begin
  select * into v_period from public.recognition_periods where id = p_period;
  if v_period is null then return; end if;
  if not (public.has_permission('recognition.approve') or public.has_permission('recognition.manage')
          or (v_period.results_visibility = 'officers' and v_period.status in ('closed', 'finalized')
              and public.has_permission('recognition.read'))) then
    raise exception 'Vote results are not visible to you yet' using errcode = '42501';
  end if;
  return query
    select v.nominee_person_id, count(*)::bigint from public.recognition_votes v
    where v.period_id = p_period group by v.nominee_person_id order by 2 desc;
end $$;

-- ---------------------------------------------------------------------------
-- Participation points (no official values are seeded — the chapter defines them)
-- ---------------------------------------------------------------------------
create table public.point_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  semester_id uuid references public.semesters (id) on delete cascade,   -- null = every semester
  category_key text references public.event_categories (key) on update cascade,  -- null = manual-only rule
  points int not null check (points between -100 and 100 and points <> 0),
  max_awards_per_semester int check (max_awards_per_semester > 0),
  audience text not null default 'member' check (audience in ('member', 'prospect', 'both')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guard_point_rule()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'New point rules must start as drafts';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and (new.points <> old.points or new.category_key is distinct from old.category_key
     or new.max_awards_per_semester is distinct from old.max_awards_per_semester) then
    raise exception 'Approved point rules cannot be edited. Retire it and create a new rule.';
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    if not public.has_permission('policies.approve') then
      raise exception 'Only policy approvers can approve point rules' using errcode = '42501';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
create trigger point_rules_guard before insert or update on public.point_rules
  for each row execute function public.guard_point_rule();

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  semester_id uuid not null references public.semesters (id) on delete restrict,
  event_id uuid references public.events (id) on delete set null,
  attendance_record_id uuid references public.attendance_records (id) on delete set null,
  rule_id uuid references public.point_rules (id) on delete set null,
  points int not null check (points <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  policy_version text,
  awarded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index point_transactions_person_idx on public.point_transactions (person_id, semester_id);
-- No double points for the same attendance under the same rule.
create unique index point_transactions_no_dup on public.point_transactions (attendance_record_id, rule_id)
  where attendance_record_id is not null and rule_id is not null;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  role_key text not null references public.roles (key) on delete cascade on update cascade,
  type text not null,
  enabled boolean not null default true,
  primary key (role_key, type)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  group_key text,
  occurrences int not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, updated_at desc);
create unique index notifications_group_unread on public.notifications (recipient_id, group_key)
  where read_at is null and group_key is not null;

-- Sends a notification to every active officer holding p_permission, unless their
-- role has that notification type switched off. Repeated alerts with the same
-- group_key are folded into one unread notification ("3 new unmatched scans").
create or replace function public.notify_permission(
  p_permission text, p_type text, p_title text, p_body text default null,
  p_link text default null, p_group_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link, group_key)
  select distinct pr.id, p_type, p_title, p_body, p_link, p_group_key
  from public.profiles pr
  join public.user_roles ur on ur.user_id = pr.id
  left join public.role_permissions rp on rp.role_key = ur.role_key and rp.permission_key = p_permission
  where pr.is_active
    and (ur.role_key = 'super_admin' or rp.permission_key is not null)
    and not exists (
      select 1 from public.notification_preferences np
      join public.user_roles ur2 on ur2.role_key = np.role_key and ur2.user_id = pr.id
      where np.type = p_type and np.enabled = false
    )
  on conflict (recipient_id, group_key) where read_at is null and group_key is not null
  do update set occurrences = public.notifications.occurrences + 1,
                title = excluded.title, body = excluded.body, updated_at = now();
end $$;

-- touch + audit
do $$
declare t text;
begin
  foreach t in array array['membership_policies','disciplinary_actions','recognition_categories',
                           'recognition_periods','point_rules','notifications']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_row()', t || '_touch', t);
  end loop;
  foreach t in array array['membership_policies','strike_records','disciplinary_actions','recognition_categories',
                           'recognition_periods','recognition_nominations','recognition_results',
                           'point_rules','point_transactions','notification_preferences']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', 'audit_' || t, t);
  end loop;
end $$;
-- Votes are audited without the nominee so anonymous ballots stay anonymous.
create or replace function public.audit_vote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, changes)
  values (auth.uid(), lower(tg_op), 'recognition_votes', coalesce(new.period_id, old.period_id)::text,
          jsonb_build_object('period_id', coalesce(new.period_id, old.period_id)));
  return coalesce(new, old);
end $$;
create trigger audit_recognition_votes after insert or delete on public.recognition_votes
  for each row execute function public.audit_vote();
