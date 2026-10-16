-- =============================================================================
-- Read helpers that expose the MINIMUM information needed by other roles.
-- =============================================================================

-- Standing needs to know whether dues are satisfied, but officers without the
-- dues.read permission must not see amounts, dates or notes. This returns only
-- a yes/no per member for anyone who can view standing.
create or replace function public.member_dues_ok(p_semester uuid)
returns table (member_id uuid, dues_recorded boolean, dues_ok boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_permission('standing.read') or public.has_permission('dues.read')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return query
    select m.id, d.id is not null, coalesce(d.status in ('paid', 'waived'), false)
    from public.members m
    left join public.member_dues d on d.member_id = m.id and d.semester_id = p_semester;
end $$;

-- Lightweight counts for the dashboard / notification badge.
create or replace function public.open_review_counts()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'unmatched_open', (select count(*) from public.unmatched_scans where resolution_status = 'open'),
    'imports_in_preview', (select count(*) from public.attendance_imports where status = 'preview'),
    'policies_awaiting_approval', (select count(*) from public.membership_policies where status = 'draft' and approval_requested_at is not null),
    'discipline_proposed', (select count(*) from public.disciplinary_actions where status = 'proposed'),
    'unread_notifications', (select count(*) from public.notifications where recipient_id = auth.uid() and read_at is null)
  )
$$;

grant execute on function public.member_dues_ok(uuid) to authenticated;
grant execute on function public.open_review_counts() to authenticated;
revoke execute on function public.member_dues_ok(uuid) from anon, public;
revoke execute on function public.open_review_counts() from anon, public;
