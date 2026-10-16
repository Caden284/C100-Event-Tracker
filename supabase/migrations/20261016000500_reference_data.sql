-- =============================================================================
-- C100 Membership Hub — Reference data required by the application.
-- This is configuration, NOT member data. Real people come only from the
-- workbook migration or PIN imports.
-- =============================================================================

insert into public.permissions (key, category, description) values
  ('members.read',        'Members',      'View the member directory and member profiles'),
  ('members.write',       'Members',      'Create and edit member records and membership status'),
  ('members.notes',       'Members',      'View and add private notes on members'),
  ('dues.read',           'Dues',         'View dues status'),
  ('dues.write',          'Dues',         'Record dues payments'),
  ('prospects.read',      'Recruitment',  'View prospective members'),
  ('prospects.write',     'Recruitment',  'Create and edit prospective-member records'),
  ('prospects.convert',   'Recruitment',  'Convert a prospective member into a member'),
  ('events.read',         'Events',       'View events and the chapter calendar'),
  ('events.write',        'Events',       'Create, edit, reschedule (drag on the calendar) and archive events'),
  ('attendance.read',     'Attendance',   'View attendance records and import history'),
  ('attendance.import',   'Attendance',   'Upload and commit PIN attendance exports'),
  ('attendance.write',    'Attendance',   'Enter and correct attendance manually'),
  ('unmatched.resolve',   'Attendance',   'Resolve the unmatched-scan review queue'),
  ('standing.read',       'Standing',     'View attendance progress and calculated standing'),
  ('discipline.read',     'Standing',     'View strikes, warnings and probation records'),
  ('discipline.propose',  'Standing',     'Record strikes and propose disciplinary actions'),
  ('discipline.approve',  'Standing',     'Approve formal warnings, probation and overrides'),
  ('policies.read',       'Policies',     'View membership policies'),
  ('policies.write',      'Policies',     'Draft and edit membership policies'),
  ('policies.approve',    'Policies',     'Approve or retire membership policies and point rules'),
  ('recognition.read',    'Recognition',  'View awards, eligibility and official results'),
  ('recognition.manage',  'Recognition',  'Configure awards and run nomination/voting periods'),
  ('recognition.nominate','Recognition',  'Submit nominations'),
  ('recognition.vote',    'Recognition',  'Vote in award elections'),
  ('recognition.approve', 'Recognition',  'Approve official award recipients'),
  ('points.read',         'Points',       'View participation points and leaderboards'),
  ('points.manage',       'Points',       'Draft point rules'),
  ('points.award',        'Points',       'Award or adjust points'),
  ('reports.export',      'Reports',      'Download reports'),
  ('reports.sensitive',   'Reports',      'Include notes, dues and disciplinary details in exports'),
  ('semesters.manage',    'Administration','Create semesters and run semester rollover'),
  ('settings.manage',     'Administration','Manage categories, statuses and app settings'),
  ('users.manage',        'Administration','Invite officers and assign roles'),
  ('audit.read',          'Administration','View the audit log'),
  ('backup.manage',       'Administration','Download and restore full backups'),
  ('data.migrate',        'Administration','Run the Excel workbook migration');

insert into public.roles (key, name, description, is_system) values
  ('super_admin',      'Super Administrator', 'Full access, including roles, policies, backups and restoration.', true),
  ('secretary',        'Secretary',           'Attendance imports, events, member & prospect records, reports.', true),
  ('president',        'President',           'Chapter-wide oversight; approves policies, discipline and recognition.', true),
  ('membership_chair', 'Membership Chair',    'Recruitment tracking, prospective members and conversions.', true),
  ('treasurer',        'Treasurer',           'Dues records and financial membership status.', true),
  ('officer',          'Executive Board Officer', 'Read-only access by default. Grant more permissions as needed.', true);

insert into public.role_permissions (role_key, permission_key)
select 'secretary', unnest(array[
  'members.read','members.write','members.notes','prospects.read','prospects.write',
  'events.read','events.write','attendance.read','attendance.import','attendance.write','unmatched.resolve',
  'standing.read','discipline.read','discipline.propose','policies.read','policies.write',
  'recognition.read','recognition.manage','recognition.nominate','recognition.vote',
  'points.read','points.manage','points.award','reports.export','reports.sensitive','audit.read','data.migrate'])
union all
select 'president', unnest(array[
  'members.read','members.write','members.notes','dues.read','prospects.read','prospects.convert',
  'events.read','events.write','attendance.read','standing.read','discipline.read','discipline.propose','discipline.approve',
  'policies.read','policies.approve','recognition.read','recognition.nominate','recognition.vote','recognition.approve',
  'points.read','reports.export','reports.sensitive','audit.read'])
union all
select 'membership_chair', unnest(array[
  'members.read','prospects.read','prospects.write','prospects.convert','events.read','attendance.read',
  'standing.read','recognition.read','recognition.nominate','recognition.vote','points.read','reports.export'])
union all
select 'treasurer', unnest(array['members.read','dues.read','dues.write','events.read','standing.read','reports.export'])
union all
select 'officer', unnest(array['members.read','prospects.read','events.read','attendance.read','standing.read',
  'recognition.read','recognition.nominate','recognition.vote','points.read']);

-- Workbook category model (Settings tab + Events!E validation list).
insert into public.event_categories (key, name, description, is_recruitment, is_legacy, color, sort_order) values
  ('meeting',     'Meeting',     'General Body Meetings',                                   false, false, 'blue',    1),
  ('general',     'General',     'General chapter programming',                             false, false, 'indigo',  2),
  ('service',     'Service',     'Community service events',                                false, false, 'emerald', 3),
  ('mentoring',   'Mentoring',   'Carver/BEST mentoring sessions and mentorship programming', false, false, 'amber',   4),
  ('study',       'Study',       'Study sessions (legacy). Tracked for visibility; counts toward nothing unless a policy says so.', false, true, 'slate', 5),
  ('recruitment', 'Recruitment', 'Recruitment events such as Meet the 100 — for prospective-member tracking, not member standards.', true, false, 'rose', 6);

insert into public.member_statuses (key, name, description, counts_as_active, is_tracked, sort_order) values
  ('active',       'Active',       'Current member. Evaluated against attendance standards.', true,  true,  1),
  ('not_verified', 'Not Verified', 'On the roster but membership not yet confirmed.',        false, true,  2),
  ('inactive',     'Inactive',     'Not currently participating. History is kept.',          false, false, 3),
  ('graduated',    'Graduated',    'Graduated. History is kept.',                            false, false, 4),
  ('removed',      'Removed',      'Removed from the roster. History is kept.',              false, false, 5);

insert into public.attendance_statuses (key, name, counts_as_attended, is_active, pin_aliases, sort_order) values
  ('attended',   'Attended',   true,  true,  array['attended','present','checked in','checked-in','yes','scanned'], 1),
  ('absent',     'Absent',     false, true,  array['absent','no show','no-show','did not attend','not attended'], 2),
  ('registered', 'Registered (did not check in)', false, true, array['registered','rsvp','rsvped','going','pending'], 3),
  ('excused',    'Excused',    false, false, array['excused'], 4);

insert into public.app_settings (key, value, description) values
  ('organization', '{"name": "Collegiate 100 at Georgia State University", "short_name": "C100 GSU", "app_name": "C100 Membership Hub"}',
   'Display names'),
  ('prospect_engagement', '{"high_min_events": 3, "medium_min_events": 2, "count_all_categories": true}',
   'Interest indicators for prospective members (workbook: 3+ = High, 2 = Medium, otherwise Low). Indicators, not judgments.'),
  ('import_limits', '{"max_file_mb": 5, "max_rows": 5000}', 'Upload limits for attendance and workbook files'),
  ('at_risk', '{"behind_pace_margin": 0.25}', 'A member is flagged "behind pace" when their progress trails the share of the semester elapsed by more than this margin.');

-- Recognition categories requested by the chapter. Eligibility rules start empty
-- (inactive) until the board configures them.
insert into public.recognition_categories (key, name, description, audience, uses_auto_eligibility, uses_nominations, uses_voting, uses_officer_decision, eligibility_rules) values
  ('outstanding_general_body_member', 'Outstanding General Body Member',
   'Recognizes a full member for participation, service, mentoring and involvement.', 'member', true, true, false, true,
   '{"min_counted_events": null, "min_categories_attended": null, "require_member_status": ["active"]}'),
  ('outstanding_perspective', 'Outstanding Perspective',
   'Recognizes a prospective member going through recruitment for consistent engagement.', 'prospect', true, true, false, true,
   '{"min_events_attended": null, "min_distinct_months": null}'),
  ('most_improved_member', 'Most Improved Member',
   'Compares attendance RATE (attended ÷ events available) between comparable semesters. Members without a prior baseline are not ranked.', 'member', true, true, false, true,
   '{"min_baseline_events": 3, "comparison": "previous_semester"}');
