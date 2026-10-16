import { afterAll, describe, expect, it } from "vitest";
import { getPool, hasDb, makeUser, seedBasics, withTx, type Db } from "./helpers";
import { workbookDraftRules } from "@/lib/domain/policy";
import { buildSampleWorkbook } from "../fixtures/sample-workbook";
import { parseWorkbook } from "@/lib/workbook/parse-workbook";

const d = hasDb ? describe : describe.skip;
afterAll(async () => { if (hasDb) await getPool().end(); });
const rules = JSON.stringify(workbookDraftRules({ meetings: 2, general: 3, service: 3, mentoring: 3 }));

async function draftPolicy(db: Db) {
  return (await db.one<{ id: string }>("insert into membership_policies (name, version, rules) values ('Test standards', 99, $1) returning id", [rules])).id;
}

d("policies & discipline", () => {
  it("new policies are drafts and only approvers can approve them", () => withTx(async (db) => {
    const sec = await makeUser(db, ["secretary"]);
    const pres = await makeUser(db, ["president"]);
    await db.as(sec);
    expect(await db.fails("insert into membership_policies (name, version, rules, status) values ('X', 1, $1, 'approved')", [rules])).toMatch(/must start as drafts/);
    const id = await draftPolicy(db);
    expect(await db.fails("update membership_policies set status = 'approved' where id = $1", [id])).toMatch(/permission to approve/);
    await db.as(pres);
    await db.query("update membership_policies set status = 'approved', approval_note = 'Vote 7-1' where id = $1", [id]);
    const p = await db.one<{ approved_by: string; status: string }>("select approved_by, status from membership_policies where id = $1", [id]);
    expect(p).toEqual({ approved_by: pres, status: "approved" });
    expect(await db.fails("update membership_policies set rules = '{}'::jsonb where id = $1", [id])).toMatch(/immutable/);
    expect(Number((await db.one<{ c: string }>("select count(*) c from policy_approvals where policy_id = $1 and action = 'approved'", [id])).c)).toBe(1);
  }));

  it("draft policies cannot produce formal disciplinary actions", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const sec = await makeUser(db, ["secretary"]);
    const pres = await makeUser(db, ["president"]);
    await db.as(sec);
    const pol = await draftPolicy(db);
    const member = (await db.one<{ id: string }>("select id from members where person_id = $1", [s.alex])).id;
    expect(await db.fails("insert into disciplinary_actions (member_id, policy_id, action_type, reason) values ($1, $2, 'probation', 'Missed requirements')", [member, pol])).toMatch(/No approved policy/);
    expect(await db.fails("insert into disciplinary_actions (member_id, policy_id, action_type, reason, is_override, override_reason) values ($1, $2, 'probation', 'Missed requirements', true, 'Board vote')", [member, pol])).toMatch(/Only officers who can approve/);
    await db.as(pres);
    const a = await db.one<{ id: string; status: string }>("insert into disciplinary_actions (member_id, policy_id, action_type, reason, is_override, override_reason) values ($1, $2, 'formal_warning', 'Missed requirements', true, 'Approved by e-board vote 10/20') returning id, status", [member, pol]);
    expect(a.status).toBe("proposed");
    await db.as(sec);
    expect(await db.fails("update disciplinary_actions set status = 'approved' where id = $1", [a.id])).toMatch(/permission/);
    await db.as(pres);
    await db.query("update disciplinary_actions set status = 'approved' where id = $1", [a.id]);
    expect((await db.one<{ approved_by: string }>("select approved_by from disciplinary_actions where id = $1", [a.id])).approved_by).toBe(pres);
  }));

  it("an approved policy allows proposals, but approval is still required", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const pol = await draftPolicy(db);
    await db.query("update membership_policies set status = 'approved' where id = $1", [pol]);
    const sec = await makeUser(db, ["secretary"]);
    await db.as(sec);
    const member = (await db.one<{ id: string }>("select id from members where person_id = $1", [s.alex])).id;
    const a = await db.one<{ status: string }>("insert into disciplinary_actions (member_id, policy_id, action_type, reason, status) values ($1, $2, 'formal_warning', 'Missed two GBMs', 'proposed') returning status", [member, pol]);
    expect(a.status).toBe("proposed");
    expect(await db.fails("insert into disciplinary_actions (member_id, policy_id, action_type, reason, status) values ($1, $2, 'probation', 'Skip approval', 'active')", [member, pol])).toMatch(/must start as proposed/);
  }));

  it("changing an archived semester's policy needs an approver and a recorded decision", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const pol = await draftPolicy(db);
    await db.query("update semesters set status = 'archived' where id = $1", [s.semester]);
    const admin = await makeUser(db, ["super_admin"]);
    await db.as(admin);
    expect(await db.fails("update semesters set policy_id = $2 where id = $1", [s.semester, pol])).toMatch(/assign_policy_to_semester/);
    expect(await db.fails("select assign_policy_to_semester($1, $2, 'short')", [s.semester, pol])).toMatch(/retroactive/);
    await db.query("select assign_policy_to_semester($1, $2, 'Board voted to apply v99 to Fall retroactively')", [s.semester, pol]);
  }));
});

d("recognition & points", () => {
  async function period(db: Db, s: Awaited<ReturnType<typeof seedBasics>>, voting = true) {
    const cat = (await db.one<{ id: string }>("insert into recognition_categories (key, name, audience, uses_voting) values ('test_award_' || substr(md5(random()::text), 1, 6), 'Test award', 'member', $1) returning id", [voting])).id;
    return (await db.one<{ id: string }>("insert into recognition_periods (category_id, semester_id, name, max_votes_per_voter) values ($1, $2, 'Test period', 1) returning id", [cat, s.semester])).id;
  }
  it("prevents duplicate nominations and enforces windows and audience", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const pid = await period(db, s);
    const officer = await makeUser(db, ["officer"]);
    await db.as(officer);
    expect(await db.fails("insert into recognition_nominations (period_id, nominee_person_id, nominated_by) values ($1, $2, $3)", [pid, s.alex, officer])).toMatch(/not open/);
    await db.as(null);
    await db.query("update recognition_periods set status = 'nominations_open' where id = $1", [pid]);
    await db.as(officer);
    await db.query("insert into recognition_nominations (period_id, nominee_person_id, nominated_by) values ($1, $2, $3)", [pid, s.alex, officer]);
    expect(await db.fails("insert into recognition_nominations (period_id, nominee_person_id, nominated_by) values ($1, $2, $3)", [pid, s.alex, officer])).toMatch(/duplicate key/);
    expect(await db.fails("insert into recognition_nominations (period_id, nominee_person_id, nominated_by) values ($1, $2, $3)", [pid, s.casey, officer])).toMatch(/members only/);
  }));

  it("votes are limited, private, and tallies need permission", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const pid = await period(db, s);
    await db.query("insert into recognition_nominations (period_id, nominee_person_id, nominated_by) values ($1, $2, $3), ($1, $4, $3)", [pid, s.alex, await makeUser(db, ["officer"]), s.alexa]);
    await db.query("update recognition_periods set status = 'voting_open' where id = $1", [pid]);
    const v1 = await makeUser(db, ["officer"]);
    const v2 = await makeUser(db, ["officer"]);
    await db.as(v1);
    await db.query("insert into recognition_votes (period_id, nominee_person_id, voter_id) values ($1, $2, $3)", [pid, s.alex, v1]);
    expect(await db.fails("insert into recognition_votes (period_id, nominee_person_id, voter_id) values ($1, $2, $3)", [pid, s.alexa, v1])).toMatch(/already used all of your votes/);
    await db.as(v2);
    expect((await db.query("select * from recognition_votes")).rowCount).toBe(0);
    expect(await db.fails("select * from recognition_vote_tally($1)", [pid])).toMatch(/not visible/);
    const pres = await makeUser(db, ["president"]);
    await db.as(pres);
    expect(Number((await db.one<{ votes: string }>("select votes from recognition_vote_tally($1)", [pid])).votes)).toBe(1);
  }));

  it("only approvers make results official; history persists", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const pid = await period(db, s, false);
    await db.as(await makeUser(db, ["secretary"]));
    expect(await db.fails("insert into recognition_results (period_id, person_id, is_official) values ($1, $2, true)", [pid, s.alex])).toMatch(/Only an authorized officer/);
    await db.query("insert into recognition_results (period_id, person_id) values ($1, $2)", [pid, s.alex]);
    await db.as(await makeUser(db, ["president"]));
    await db.query("update recognition_results set is_official = true where period_id = $1", [pid]);
    expect((await db.one<{ is_official: boolean }>("select is_official from recognition_results where period_id = $1", [pid])).is_official).toBe(true);
  }));

  it("points use approved rules only and are never awarded twice", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.query("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'attended', 'manual'), ($3, $2, 'attended', 'manual')", [s.gbm, s.alex, s.service]);
    const sec = await makeUser(db, ["secretary"]);
    await db.as(sec);
    const rule = (await db.one<{ id: string }>("insert into point_rules (name, category_key, points) values ('GBM', 'meeting', 5) returning id")).id;
    expect(Number((await db.one<{ n: string }>("select award_points_for_semester($1) n", [s.semester])).n)).toBe(0); // draft rule awards nothing
    expect(await db.fails("update point_rules set status = 'approved' where id = $1", [rule])).toMatch(/Only policy approvers/);
    await db.as(null);
    await db.query("update point_rules set status = 'approved' where id = $1", [rule]);
    await db.as(sec);
    expect(Number((await db.one<{ n: string }>("select award_points_for_semester($1) n", [s.semester])).n)).toBe(1);
    expect(Number((await db.one<{ n: string }>("select award_points_for_semester($1) n", [s.semester])).n)).toBe(0);
  }));
});


/** Gives the sample payload unique names so it never collides with real data in the database. */
function isolate(payload: Awaited<ReturnType<typeof parseWorkbook>>["payload"], tag: string) {
  payload.semester = { ...payload.semester, name: `Sample Fall 2026 (${tag})` };
  for (const e of payload.events) { e.legacy_key = `${tag}:${e.legacy_key}`; e.name = `${e.name} [${tag}]`; if (e.pin_name) e.pin_name = `${e.pin_name} [${tag}]`; }
  for (const a of payload.attendance) if (a.pin_event_name) a.pin_event_name = `${a.pin_event_name} [${tag}]`;
  for (const p of payload.people) { p.legacy_key = `${tag}:${p.legacy_key}`; if (p.first_seen) p.first_seen = `${p.first_seen} [${tag}]`; if (p.email?.includes("@")) p.email = p.email.replace("@", `+${tag}@`); }
  for (const a of payload.attendance) if (a.email?.includes("@")) a.email = a.email.replace("@", `+${tag}@`);
  for (const u of payload.unmatched) { u.legacy_key = `${tag}:${u.legacy_key}`; if (u.event) u.event = `${u.event} [${tag}]`; }
  return payload;
}

d("workbook migration", () => {
  it("is repeatable without duplicates and can be rolled back", () => withTx(async (db) => {
    const payload = isolate((await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx")).payload, "t1");
    const admin = await makeUser(db, ["super_admin"]);
    await db.as(admin);
    const first = (await db.one<{ s: Record<string, unknown> }>("select commit_workbook_migration($1) s", [JSON.stringify(payload)])).s;
    expect(first).toMatchObject({ members_created: 3, prospects_created: 2, events_created: 5, semester_created: true, policy_created: true });
    expect(first.attendance_created).toBe(6); // 7 log rows: 6 matched + 1 unknown event
    expect(first.attendance_unresolved).toBe(1); // unknown event name → review queue, not discarded
    const pol = await db.one<{ status: string }>("select status from membership_policies where id = $1", [first.policy_id]);
    expect(pol.status).toBe("draft");
    const second = (await db.one<{ s: Record<string, unknown> }>("select commit_workbook_migration($1) s", [JSON.stringify(payload)])).s;
    expect(second).toMatchObject({ members_created: 0, prospects_created: 0, events_created: 0, attendance_created: 0, unmatched_scans_created: 0 });
    // placeholder-email prospect keeps their attendance
    expect(Number((await db.one<{ c: string }>("select count(*) c from attendance_records ar join people p on p.id = ar.person_id where p.first_name = 'Drew'")).c)).toBe(1);
    await db.query("select rollback_workbook_migration($1, 'Testing rollback')", [first.run_id]);
    expect(Number((await db.one<{ c: string }>("select count(*) c from people where migration_run_id = $1", [first.run_id])).c)).toBe(0);
    expect(Number((await db.one<{ c: string }>("select count(*) c from semesters where name = 'Sample Fall 2026 (t1)'")).c)).toBe(0);
  }));

  it("refuses rollback when later data depends on it", () => withTx(async (db) => {
    const payload = isolate((await parseWorkbook(await buildSampleWorkbook(), "sample.xlsx")).payload, "t2");
    await db.as(await makeUser(db, ["super_admin"]));
    const s = (await db.one<{ s: Record<string, string> }>("select commit_workbook_migration($1) s", [JSON.stringify(payload)])).s;
    const ev = await db.one<{ id: string }>("select id from events where migration_run_id = $1 and name = 'Wellness Pilates [t2]'", [s.run_id]);
    const person = await db.one<{ id: string }>("select id from people where migration_run_id = $1 and first_name = 'Alex'", [s.run_id]);
    await db.query("select set_manual_attendance($1, $2, 'attended')", [ev.id, person.id]);
    expect(await db.fails("select rollback_workbook_migration($1, 'Testing rollback')", [s.run_id])).toMatch(/depends on it/);
  }));
});
