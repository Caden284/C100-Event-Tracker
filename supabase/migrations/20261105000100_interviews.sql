-- =============================================================================
-- Membership intake interviews.
--
--   intake_cycles      one interview round (e.g. "Fall 2026 Intake"): spots,
--                      phase, engagement cutoff and the rubric/questions/script
--                      (config jsonb, kept in the database rather than the repo
--                      because the packet is confidential).
--   intake_applicants  who is being interviewed, their facts, interviewer, slot,
--                      status, frozen engagement points and the final decision.
--   interview_scores   one interviewer's notes and 1–5 scores for one applicant.
--
-- Blind scoring: until the cycle reaches deliberation, a score row is visible
-- only to the interviewer who wrote it — whatever their role. Once deliberation
-- opens, everyone with interview access sees all scores and no score can change.
-- =============================================================================

insert into public.permissions (key, category, description) values
  ('interviews.conduct', 'Interviews', 'Interview applicants and score your own interviews'),
  ('interviews.manage',  'Interviews', 'Set up intake, add applicants, assign interviewers, open deliberation and record decisions');

insert into public.role_permissions (role_key, permission_key)
select r, 'interviews.conduct' from unnest(array['secretary', 'president', 'membership_chair', 'treasurer', 'officer']) r
union all
select r, 'interviews.manage' from unnest(array['secretary', 'president', 'membership_chair']) r;

-- Prospective-member statuses for the intake process.
alter table public.prospective_members drop constraint prospective_members_status_check;
alter table public.prospective_members add constraint prospective_members_status_check
  check (status in ('in_recruitment', 'interviewing', 'not_advancing', 'converted', 'withdrawn', 'not_eligible'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.intake_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  semester_id uuid references public.semesters (id) on delete set null,
  status text not null default 'setup' check (status in ('setup', 'interviewing', 'deliberation', 'closed')),
  spots int not null default 35 check (spots between 1 and 500),
  engagement_cutoff date,
  engagement_counted_at timestamptz,
  decisions_by date,
  dues_amount_cents int check (dues_amount_cents is null or dues_amount_cents >= 0),
  dues_due date,
  config jsonb not null default '{}',
  deliberation_opened_at timestamptz,
  deliberation_opened_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.intake_applicants (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.intake_cycles (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  group_label text,
  tier text,
  classification text,
  major text,
  gpa numeric(3, 2) check (gpa is null or gpa between 0 and 4.5),
  hours_offered text,
  events_reported int,                -- the number on the source sheet, for reference only
  engagement_events int,              -- counted from attendance as of the cycle's cutoff
  engagement_points int,
  interviewer_id uuid references public.profiles (id) on delete set null,
  slot_at timestamptz,
  slot_note text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'no_show', 'rescheduled', 'withdrawn')),
  decision text check (decision in ('offer', 'waitlist', 'decline')),
  waitlist_rank int check (waitlist_rank is null or waitlist_rank > 0),
  decision_note text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, person_id)
);
create index intake_applicants_interviewer_idx on public.intake_applicants (cycle_id, interviewer_id);
create index intake_applicants_person_idx on public.intake_applicants (person_id);

create table public.interview_scores (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.intake_applicants (id) on delete cascade,
  interviewer_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  scores jsonb not null default '{}',      -- criterion key -> whole number 1..5
  answers jsonb not null default '{}',     -- question key -> interviewer's notes
  own_question text check (own_question is null or length(own_question) <= 1000),
  own_notes text check (own_notes is null or length(own_notes) <= 5000),
  recommendation text check (recommendation in ('strong_yes', 'yes', 'lean_no', 'no')),
  red_flag boolean not null default false,
  red_flag_note text check (red_flag_note is null or length(red_flag_note) <= 2000),
  notes text check (notes is null or length(notes) <= 5000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (applicant_id, interviewer_id)
);
create index interview_scores_interviewer_idx on public.interview_scores (interviewer_id);

create trigger intake_cycles_touch before update on public.intake_cycles for each row execute function public.touch_row();
create trigger intake_applicants_touch before update on public.intake_applicants for each row execute function public.touch_row();
create trigger interview_scores_touch before update on public.interview_scores for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Phases only move forward (setup <-> interviewing is allowed while nobody has scored).
create or replace function public.guard_intake_cycle()
returns trigger language plpgsql set search_path = public as $$
declare v_order constant text[] := array['setup', 'interviewing', 'deliberation', 'closed'];
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if array_position(v_order, new.status) < array_position(v_order, old.status)
       and not (old.status = 'interviewing' and new.status = 'setup'
                and not exists (select 1 from public.interview_scores s join public.intake_applicants a on a.id = s.applicant_id where a.cycle_id = old.id)) then
      raise exception 'An intake cannot move back from % to %', old.status, new.status;
    end if;
    if new.status = 'deliberation' then
      new.deliberation_opened_at := now();
      new.deliberation_opened_by := auth.uid();
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status in ('deliberation', 'closed') and new.config is distinct from old.config then
    raise exception 'The rubric cannot change once deliberation has opened';
  end if;
  return new;
end $$;
create trigger intake_cycles_guard before insert or update on public.intake_cycles
  for each row execute function public.guard_intake_cycle();

-- Officers without interviews.manage may only claim/release their own interview
-- and mark its outcome; everything else on the applicant row is the coordinator's.
create or replace function public.guard_intake_applicant()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  select status into v_status from public.intake_cycles where id = new.cycle_id;
  if tg_op = 'UPDATE' and (new.decision is distinct from old.decision or new.waitlist_rank is distinct from old.waitlist_rank) then
    if v_status not in ('deliberation', 'closed') then
      raise exception 'Decisions are recorded once deliberation opens';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  if public.has_permission('interviews.manage') then return new; end if;
  if tg_op <> 'UPDATE' then raise exception 'Only the intake coordinator can add applicants' using errcode = '42501'; end if;
  if (to_jsonb(new) - array['interviewer_id', 'status', 'updated_at', 'updated_by'])
     is distinct from (to_jsonb(old) - array['interviewer_id', 'status', 'updated_at', 'updated_by']) then
    raise exception 'Only the intake coordinator can change applicant details' using errcode = '42501';
  end if;
  if new.interviewer_id is distinct from old.interviewer_id
     and not ((old.interviewer_id is null and new.interviewer_id = auth.uid())
              or (old.interviewer_id = auth.uid() and new.interviewer_id is null)) then
    raise exception 'You can take an unassigned interview or hand back your own, nothing else' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and coalesce(new.interviewer_id, old.interviewer_id) is distinct from auth.uid() then
    raise exception 'Only the assigned interviewer can update this interview' using errcode = '42501';
  end if;
  if v_status <> 'interviewing' then
    raise exception 'Interviews are not open right now';
  end if;
  return new;
end $$;
create trigger intake_applicants_guard before insert or update on public.intake_applicants
  for each row execute function public.guard_intake_applicant();

-- Score rows: your own, for your assigned applicant, valid 1–5 against the rubric,
-- and only while the cycle is interviewing. Locked the moment deliberation opens.
create or replace function public.guard_interview_score()
returns trigger language plpgsql set search_path = public as $$
declare
  v_app public.intake_applicants%rowtype;
  v_cycle public.intake_cycles%rowtype;
  v_keys text[];
  v_key text;
  v_val jsonb;
begin
  if public.is_privileged() and auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and (new.applicant_id is distinct from old.applicant_id or new.interviewer_id is distinct from old.interviewer_id) then
    raise exception 'A score cannot be moved to another applicant or interviewer';
  end if;
  if tg_op = 'INSERT' then new.interviewer_id := auth.uid(); end if;
  select * into v_app from public.intake_applicants where id = new.applicant_id;
  select * into v_cycle from public.intake_cycles where id = v_app.cycle_id;
  if v_cycle.status in ('deliberation', 'closed') then
    raise exception 'Scores are locked: deliberation has started';
  end if;
  if v_cycle.status <> 'interviewing' then
    raise exception 'Interviews are not open yet';
  end if;
  if v_app.interviewer_id is distinct from auth.uid() then
    raise exception 'Only the assigned interviewer can score this applicant' using errcode = '42501';
  end if;
  select coalesce(array_agg(c ->> 'key'), '{}') into v_keys from jsonb_array_elements(coalesce(v_cycle.config -> 'rubric', '[]')) c;
  for v_key, v_val in select * from jsonb_each(new.scores) loop
    if jsonb_typeof(v_val) = 'null' then continue; end if;
    if cardinality(v_keys) > 0 and not (v_key = any (v_keys)) then
      raise exception 'Unknown rubric criterion "%"', v_key;
    end if;
    if jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}')::numeric not in (1, 2, 3, 4, 5) then
      raise exception 'Scores are whole numbers from 1 to 5';
    end if;
  end loop;
  new.scores := jsonb_strip_nulls(new.scores);
  if new.submitted_at is not null then
    if exists (select 1 from unnest(v_keys) k where not (new.scores ? k)) then
      raise exception 'Score every criterion before submitting';
    end if;
    if new.recommendation is null then
      raise exception 'Choose a recommendation before submitting';
    end if;
  end if;
  return new;
end $$;
create trigger interview_scores_guard before insert or update on public.interview_scores
  for each row execute function public.guard_interview_score();

-- Adding someone to an intake moves their prospect record to "interviewing".
create or replace function public.sync_prospect_on_intake()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.prospective_members
     set status = 'interviewing', change_reason = 'Added to intake interviews'
   where person_id = new.person_id and status in ('in_recruitment', 'not_advancing');
  return new;
end $$;
create trigger intake_applicants_sync_prospect after insert on public.intake_applicants
  for each row execute function public.sync_prospect_on_intake();

-- Audit: applicants and cycles in full; scores only as events (never their content,
-- so the audit log can't be used to see scores before deliberation).
create or replace function public.audit_interview_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.bulk_operation', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, table_name, record_id, metadata)
    values (auth.uid(), 'interview_started', 'interview_scores', new.id::text, jsonb_build_object('applicant_id', new.applicant_id));
  end if;
  if new.submitted_at is not null and (tg_op = 'INSERT' or old.submitted_at is null) then
    insert into public.audit_logs (actor_id, action, table_name, record_id, metadata)
    values (auth.uid(), 'interview_submitted', 'interview_scores', new.id::text, jsonb_build_object('applicant_id', new.applicant_id));
  end if;
  return new;
end $$;
create trigger audit_interview_scores after insert or update on public.interview_scores
  for each row execute function public.audit_interview_score();
create trigger audit_intake_cycles after insert or update or delete on public.intake_cycles
  for each row execute function public.audit_row_change();
create trigger audit_intake_applicants after insert or update or delete on public.intake_applicants
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Engagement points: events attended up to the cutoff, frozen on the applicant.
-- ---------------------------------------------------------------------------
create or replace function public.count_intake_engagement(p_cycle uuid, p_cutoff date)
returns int language plpgsql set search_path = public as $$
declare v_tiers jsonb; v_n int;
begin
  perform public.require_permission('interviews.manage');
  select coalesce(config -> 'engagement', '[{"min":5,"points":5},{"min":3,"points":3},{"min":1,"points":1}]')
    into v_tiers from public.intake_cycles where id = p_cycle;
  if not found then raise exception 'Intake not found'; end if;
  update public.intake_applicants a
     set engagement_events = c.n,
         engagement_points = coalesce((select max((t ->> 'points')::int) from jsonb_array_elements(v_tiers) t where c.n >= (t ->> 'min')::int), 0)
    from (select ap.id, (select count(distinct ar.event_id)
                           from public.attendance_records ar
                           join public.attendance_statuses st on st.key = ar.status_key and st.counts_as_attended
                           join public.events e on e.id = ar.event_id and e.archived_at is null
                          where ar.person_id = ap.person_id and e.event_date <= p_cutoff)::int n
            from public.intake_applicants ap where ap.cycle_id = p_cycle) c
   where a.id = c.id;
  get diagnostics v_n = row_count;
  update public.intake_cycles set engagement_cutoff = p_cutoff, engagement_counted_at = now() where id = p_cycle;
  return v_n;
end $$;

-- Progress without revealing any score: per interviewer, how many assigned,
-- completed, no-shows and submitted.
create or replace function public.intake_progress(p_cycle uuid)
returns table (interviewer_id uuid, interviewer_name text, assigned int, completed int, no_show int, submitted int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_permission('interviews.conduct') or public.has_permission('interviews.manage')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return query
    select a.interviewer_id, coalesce(p.full_name, p.email, 'Unassigned'),
           count(*)::int,
           count(*) filter (where a.status = 'completed')::int,
           count(*) filter (where a.status = 'no_show')::int,
           count(s.id) filter (where s.submitted_at is not null)::int
      from public.intake_applicants a
      left join public.profiles p on p.id = a.interviewer_id
      left join public.interview_scores s on s.applicant_id = a.id and s.interviewer_id = a.interviewer_id
     where a.cycle_id = p_cycle
     group by 1, 2
     order by 2;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.intake_cycles enable row level security;
alter table public.intake_applicants enable row level security;
alter table public.interview_scores enable row level security;

create policy intake_cycles_select on public.intake_cycles for select to authenticated
  using ((select public.perm('interviews.conduct')) or (select public.perm('interviews.manage')));
create policy intake_cycles_insert on public.intake_cycles for insert to authenticated with check ((select public.perm('interviews.manage')));
create policy intake_cycles_update on public.intake_cycles for update to authenticated
  using ((select public.perm('interviews.manage'))) with check ((select public.perm('interviews.manage')));

create policy intake_applicants_select on public.intake_applicants for select to authenticated
  using ((select public.perm('interviews.conduct')) or (select public.perm('interviews.manage')));
create policy intake_applicants_insert on public.intake_applicants for insert to authenticated with check ((select public.perm('interviews.manage')));
create policy intake_applicants_update on public.intake_applicants for update to authenticated
  using ((select public.perm('interviews.manage'))
         or ((select public.perm('interviews.conduct')) and (interviewer_id is null or interviewer_id = (select auth.uid()))))
  with check ((select public.perm('interviews.manage'))
         or ((select public.perm('interviews.conduct')) and (interviewer_id is null or interviewer_id = (select auth.uid()))));
create policy intake_applicants_delete on public.intake_applicants for delete to authenticated
  using ((select public.perm('interviews.manage'))
         and not exists (select 1 from public.interview_scores s where s.applicant_id = intake_applicants.id));

-- Blind until deliberation, for every role.
create policy interview_scores_select on public.interview_scores for select to authenticated
  using (interviewer_id = (select auth.uid())
         or (((select public.perm('interviews.conduct')) or (select public.perm('interviews.manage')))
             and exists (select 1 from public.intake_applicants a join public.intake_cycles c on c.id = a.cycle_id
                          where a.id = interview_scores.applicant_id and c.status in ('deliberation', 'closed'))));
create policy interview_scores_insert on public.interview_scores for insert to authenticated
  with check (interviewer_id = (select auth.uid()) and (select public.perm('interviews.conduct')));
create policy interview_scores_update on public.interview_scores for update to authenticated
  using (interviewer_id = (select auth.uid()) and (select public.perm('interviews.conduct')))
  with check (interviewer_id = (select auth.uid()) and (select public.perm('interviews.conduct')));

grant select, insert, update, delete on public.intake_cycles, public.intake_applicants, public.interview_scores to authenticated;
grant execute on function public.count_intake_engagement(uuid, date) to authenticated;
grant execute on function public.intake_progress(uuid) to authenticated;
revoke execute on function public.count_intake_engagement(uuid, date) from anon, public;
revoke execute on function public.intake_progress(uuid) from anon, public;
revoke execute on function public.guard_intake_cycle() from anon, public, authenticated;
revoke execute on function public.guard_intake_applicant() from anon, public, authenticated;
revoke execute on function public.guard_interview_score() from anon, public, authenticated;
revoke execute on function public.sync_prospect_on_intake() from anon, public, authenticated;
revoke execute on function public.audit_interview_score() from anon, public, authenticated;
