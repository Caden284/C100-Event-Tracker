-- =============================================================================
-- C100 Membership Hub — Foundation
-- Helpers, officer profiles, roles & permissions, audit log, app settings.
--
-- Security model (read this first):
--   * Every table has Row Level Security enabled. The anonymous role gets nothing.
--   * Signed-in users only see/do what their roles' permissions allow
--     (public.has_permission). Hiding a button in the UI is never the only check.
--   * "Privileged" contexts (database owner, service role used by the backup /
--     bootstrap scripts) bypass the business-rule triggers below.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

-- Lower-cases, trims and collapses whitespace. Used for exact PIN-name matching.
create or replace function public.norm_text(t text)
returns text language sql immutable parallel safe as $$
  select nullif(regexp_replace(lower(btrim(coalesce(t, ''))), '\s+', ' ', 'g'), '')
$$;

-- Lower-cases and strips all whitespace from an email address.
create or replace function public.norm_email(t text)
returns text language sql immutable parallel safe as $$
  select nullif(regexp_replace(lower(btrim(coalesce(t, ''))), '\s', '', 'g'), '')
$$;

create or replace function public.is_valid_email(t text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(t ~* '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$', false)
$$;

-- True when running as the database owner / service role (scripts, migrations,
-- SECURITY DEFINER internals) rather than as a signed-in officer.
create or replace function public.is_privileged()
returns boolean language sql stable as $$
  select current_user not in ('authenticated', 'anon')
$$;

-- Maintains updated_at / updated_by on any table that has them.
create or replace function public.touch_row()
returns trigger language plpgsql as $$
begin
  new := jsonb_populate_record(new, jsonb_build_object('updated_at', now(), 'updated_by', auth.uid()));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Officer accounts
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per executive-board login. Created automatically when an auth user is created.';

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key,
  category text not null,
  description text not null
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade on update cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null references public.roles (key) on delete cascade on update cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index user_roles_role_idx on public.user_roles (role_key);

-- Does the signed-in user hold this permission? Super administrators hold all.
create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    left join public.role_permissions rp on rp.role_key = ur.role_key and rp.permission_key = p_permission
    where ur.user_id = auth.uid()
      and (ur.role_key = 'super_admin' or rp.permission_key is not null)
  )
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    where ur.user_id = auth.uid() and ur.role_key = 'super_admin'
  )
$$;

-- Any active profile with at least one role counts as an officer.
create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    where ur.user_id = auth.uid()
  )
$$;

-- All permission keys the current user holds (used by the UI to show/hide navigation).
create or replace function public.my_permissions()
returns setof text language sql stable security definer set search_path = public as $$
  select p.key from public.permissions p
  where public.is_super_admin()
  union
  select rp.permission_key
  from public.user_roles ur
  join public.profiles pr on pr.id = ur.user_id and pr.is_active
  join public.role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = auth.uid()
$$;

-- Guard: only super administrators may grant or revoke super_admin, and the last
-- active super administrator cannot be removed (prevents lock-out).
create or replace function public.guard_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.role_key, old.role_key);
  v_remaining int;
begin
  if public.is_privileged() and auth.uid() is null then
    return coalesce(new, old);
  end if;
  if v_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Only a super administrator can grant or revoke the super administrator role'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.role_key = 'super_admin' then
    select count(*) into v_remaining
    from public.user_roles ur join public.profiles p on p.id = ur.user_id and p.is_active
    where ur.role_key = 'super_admin' and ur.user_id <> old.user_id;
    if v_remaining = 0 then
      raise exception 'Cannot remove the last active super administrator';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := coalesce(new.granted_by, auth.uid());
  end if;
  return coalesce(new, old);
end $$;

create trigger user_roles_guard
  before insert or update or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- Officers may edit their own display name, but only user managers may change
-- activation status or email.
create or replace function public.guard_profiles()
returns trigger language plpgsql as $$
begin
  if public.is_privileged() then return new; end if;
  if (new.is_active is distinct from old.is_active or new.email is distinct from old.email)
     and not public.has_permission('users.manage') then
    raise exception 'Only user managers can change account status or email' using errcode = '42501';
  end if;
  if new.is_active = false and old.is_active = true and new.id = auth.uid() then
    raise exception 'You cannot deactivate your own account';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profiles();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text,
  record_id text,
  reason text,
  changes jsonb,
  metadata jsonb
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
comment on table public.audit_logs is 'Append-only history of significant changes. No one can update or delete rows through the API.';

-- Row-change trigger. Records only the columns that changed. Never stores
-- passwords or tokens (none live in public tables); note bodies are redacted.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_record text;
begin
  if coalesce(current_setting('app.bulk_operation', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at', 'updated_by', 'change_reason')
         and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'created_at' - 'updated_at' - 'change_reason';
  else
    v_changes := v_old;
  end if;

  if tg_table_name = 'member_notes' and v_changes ? 'body' then
    v_changes := jsonb_set(v_changes, '{body}', '"[redacted]"');
  end if;

  v_record := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    (coalesce(v_new, v_old) ->> 'user_id') || ':' || (coalesce(v_new, v_old) ->> 'role_key'),
    (coalesce(v_new, v_old) ->> 'role_key') || ':' || (coalesce(v_new, v_old) ->> 'permission_key'),
    coalesce(v_new, v_old) ->> 'key'
  );

  insert into public.audit_logs (actor_id, action, table_name, record_id, reason, changes)
  values (auth.uid(), lower(tg_op), tg_table_name, v_record,
          coalesce(v_new ->> 'change_reason', v_old ->> 'change_reason'), v_changes);
  return coalesce(new, old);
end $$;

-- Explicit audit entries for actions that are not row changes (exports, backups…).
create or replace function public.log_audit(
  p_action text, p_table text default null, p_record_id text default null,
  p_reason text default null, p_metadata jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null and not public.is_privileged() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.is_officer() and not public.is_privileged() then
    raise exception 'Not an officer' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, table_name, record_id, reason, metadata)
  values (auth.uid(), p_action, p_table, p_record_id, p_reason, p_metadata);
end $$;

create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();
create trigger audit_role_permissions after insert or delete on public.role_permissions
  for each row execute function public.audit_row_change();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function public.audit_row_change();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- App settings (non-policy configuration)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_row();
create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();
