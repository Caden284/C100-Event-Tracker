-- =============================================================================
-- Hardening: notifications may only be raised by officers and may only link
-- inside the app (prevents phishing links in the notification center).
-- =============================================================================
create or replace function public.notify_permission(
  p_permission text, p_type text, p_title text, p_body text default null,
  p_link text default null, p_group_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_officer() then
    raise exception 'Not an officer' using errcode = '42501';
  end if;
  if p_link is not null and (p_link !~ '^/' or p_link ~ '^//') then
    raise exception 'Notification links must point inside the app';
  end if;
  if length(p_title) > 200 or length(coalesce(p_body, '')) > 1000 then
    raise exception 'Notification text is too long';
  end if;
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
revoke execute on function public.notify_permission(text, text, text, text, text, text) from anon, public;
grant execute on function public.notify_permission(text, text, text, text, text, text) to authenticated;
