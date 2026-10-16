import { afterAll, describe, expect, it } from "vitest";
import { createImport, getPool, hasDb, makeUser, seedBasics, withTx, type Db } from "./helpers";

const d = hasDb ? describe : describe.skip;
afterAll(async () => { if (hasDb) await getPool().end(); });

const count = async (db: Db, sql: string, p: unknown[] = []) => Number((await db.one<{ c: string }>(sql, p)).c);
const commit = (db: Db, id: string) => db.one<{ s: Record<string, number> }>("select public.commit_attendance_import($1) s", [id]).then((r) => r.s);

d("PIN attendance import", () => {
  it("imports a valid export and matches people by normalized email", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const sec = await makeUser(db, ["secretary"]);
    await db.as(sec);
    const imp = await createImport(db, [
      { first: "Alex", last: "Rivera", email: " ARivera@Test.edu ", event: "Test GBM", date: "2099-09-02" },
      { first: "Casey", last: "Diaz", email: "cdiaz@test.edu", event: "Test GBM", date: "2099-09-02" },
    ]);
    const sum = await commit(db, imp);
    expect(sum).toMatchObject({ inserted: 2, members: 1, prospects: 1, unmatched: 0 });
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1", [s.gbm])).toBe(2);
    expect(await count(db, "select count(*) c from attendance_records where source = 'pin_import' and created_by = $1", [sec])).toBe(2);
  }));

  it("importing the same file twice does not duplicate attendance", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    const rows = [{ first: "Alex", last: "Rivera", email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }];
    await commit(db, await createImport(db, rows, "same-sha"));
    const second = await commit(db, await createImport(db, rows, "same-sha"));
    expect(second).toMatchObject({ inserted: 0, duplicates_skipped: 1 });
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1", [s.gbm])).toBe(1);
  }));

  it("overlapping exports and in-file repeats do not double-count", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await commit(db, await createImport(db, [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }]));
    const sum = await commit(db, await createImport(db, [
      { email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" },
      { email: "arivera9@test.edu", event: "Test GBM", date: "2099-09-02" },
      { email: "ARIVERA9@test.edu", event: "Test GBM", date: "2099-09-02" },
    ]));
    expect(sum).toMatchObject({ inserted: 1, duplicates_skipped: 2 });
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1", [s.gbm])).toBe(2);
  }));

  it("the database itself rejects duplicate attendance", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.query("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'attended', 'manual')", [s.gbm, s.alex]);
    expect(await db.fails("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'attended', 'pin_import')", [s.gbm, s.alex])).toMatch(/attendance_one_per_person_event/);
  }));

  it("missing emails and similar names go to review — never auto-merged", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    const sum = await commit(db, await createImport(db, [
      { first: "Alex", last: "Rivera", email: null, event: "Test GBM", date: "2099-09-02" },
      { first: "Alex", last: "Rivera", email: "alex.r.other@test.edu", event: "Test GBM", date: "2099-09-02" },
    ]));
    expect(sum).toMatchObject({ inserted: 0, unmatched: 2, queued_for_review: 2 });
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1", [s.gbm])).toBe(0);
    const reasons = (await db.query("select reason, suggestions from unmatched_scans where event_id = $1 order by reason", [s.gbm])).rows;
    expect(reasons.map((r) => r.reason)).toEqual(["no_email", "no_match"]);
    expect(reasons[0].suggestions.length).toBeGreaterThan(0); // suggestions are offered…
    expect(await count(db, "select count(*) c from attendance_records where person_id = $1", [s.alex])).toBe(0); // …but not applied
  }));

  it("flags unmapped events and invalid statuses; non-attended statuses do not count", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    const sum = await commit(db, await createImport(db, [
      { email: "arivera@test.edu", event: "Some Event Not In The Hub", date: "2099-09-05" },
      { email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02", status: "Maybe" },
      { email: "arivera9@test.edu", event: "Test GBM", date: "2099-09-02", status: "Registered" },
    ]));
    expect(sum).toMatchObject({ unmapped_event: 1, invalid: 1, inserted: 1 });
    expect(await count(db, "select count(*) c from v_attendance_detail where event_id = $1 and counts_as_attended", [s.gbm])).toBe(0);
    expect(await count(db, "select count(*) c from unmatched_scans where reason = 'unmapped_event'")).toBeGreaterThan(0);
  }));

  it("officer-chosen event mappings are applied and remembered", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    const imp = await createImport(db, [{ email: "arivera@test.edu", event: "Clean-up (Sept)", date: "2099-09-18" }]);
    await db.query("update attendance_imports set event_resolution = jsonb_build_object('clean-up (sept)|2099-09-18', jsonb_build_object('action', 'map', 'event_id', $2::text, 'remember', true, 'pin_event_name', 'Clean-up (Sept)')) where id = $1", [imp, s.service]);
    expect((await commit(db, imp)).inserted).toBe(1);
    expect(await count(db, "select count(*) c from event_pin_names where event_id = $1 and pin_name = 'Clean-up (Sept)'", [s.service])).toBe(1);
  }));

  it("conflicting statuses are surfaced and only replaced when the officer decides", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.query("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'absent', 'manual')", [s.gbm, s.alex]);
    await db.as(await makeUser(db, ["secretary"]));
    const rows = [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }];
    expect(await commit(db, await createImport(db, rows))).toMatchObject({ conflict: 1, kept_existing: 1 });
    expect((await db.one<{ status_key: string }>("select status_key from attendance_records where event_id = $1 and person_id = $2", [s.gbm, s.alex])).status_key).toBe("absent");
    const imp = await createImport(db, rows);
    await db.query("select classify_attendance_import($1)", [imp]);
    const row = await db.one<{ id: string }>("select id from attendance_import_rows where import_id = $1", [imp]);
    await db.query("update attendance_imports set row_decisions = jsonb_build_object($2::text, 'replace') where id = $1", [imp, row.id]);
    expect(await commit(db, imp)).toMatchObject({ replaced: 1 });
    expect((await db.one<{ status_key: string }>("select status_key from attendance_records where event_id = $1 and person_id = $2", [s.gbm, s.alex])).status_key).toBe("attended");
  }));

  it("never marks absences unless the officer confirms a complete roster", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await commit(db, await createImport(db, [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }]));
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1 and status_key = 'absent'", [s.gbm])).toBe(0);
    const imp = await createImport(db, [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }]);
    expect(await db.fails("update attendance_imports set reconcile_absent = true where id = $1", [imp])).toMatch(/check/);
    await db.query("update attendance_imports set is_complete_roster = true, reconcile_absent = true where id = $1", [imp]);
    const sum = await commit(db, imp);
    expect(sum.marked_absent).toBeGreaterThan(0);
    expect((await db.one<{ status_key: string }>("select status_key from attendance_records where event_id = $1 and person_id = $2", [s.gbm, s.alexa])).status_key).toBe("absent");
  }));

  it("learns PIN card ids and uses them only when reliable", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await commit(db, await createImport(db, [{ email: "arivera@test.edu", card: "009990001", event: "Test GBM", date: "2099-09-02" }, { email: "arivera9@test.edu", card: "MANUAL", event: "Test GBM", date: "2099-09-02" }]));
    expect(await count(db, "select count(*) c from person_identifiers where kind = 'card_id'")).toBeGreaterThanOrEqual(1);
    expect(await count(db, "select count(*) c from person_identifiers where kind = 'card_id' and value = 'MANUAL'")).toBe(0);
    const sum = await commit(db, await createImport(db, [{ first: "Alex", email: null, card: "009990001", event: "Test Meet the 100", date: "2099-09-03" }]));
    expect(sum.inserted).toBe(1);
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1 and person_id = $2", [s.m100, s.alex])).toBe(1);
  }));

  it("manual corrections require a reason and update derived totals", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await db.query("select set_manual_attendance($1, $2, 'attended')", [s.gbm, s.alex]);
    expect(await count(db, "select count(*) c from v_attendance_detail where person_id = $1 and counts_as_attended", [s.alex])).toBe(1);
    expect(await db.fails("select set_manual_attendance($1, $2, 'absent')", [s.gbm, s.alex])).toMatch(/reason is required/);
    await db.query("select set_manual_attendance($1, $2, 'absent', 'Left before the meeting started')", [s.gbm, s.alex]);
    expect(await count(db, "select count(*) c from v_attendance_detail where person_id = $1 and counts_as_attended", [s.alex])).toBe(0);
    const rec = await db.one<{ id: string }>("select id from attendance_records where person_id = $1", [s.alex]);
    expect(await db.fails("select delete_attendance_record($1, 'no')", [rec.id])).toMatch(/reason/);
  }));

  it("recruitment attendance is recorded but carries the recruitment category", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await commit(db, await createImport(db, [{ email: "arivera@test.edu", event: "Test Meet the 100", date: "2099-09-03" }]));
    const r = await db.one<{ effective_category: string; member_id: string }>("select effective_category, member_id from v_attendance_detail where person_id = $1", [s.alex]);
    expect(r.effective_category).toBe("recruitment"); // the policy maps recruitment to no requirement (unit-tested)
    expect(r.member_id).toBeTruthy();
  }));

  it("unmatched scans are resolved by linking, without double-counting", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await commit(db, await createImport(db, [{ first: "Alex", last: "Rivera", email: null, event: "Test GBM", date: "2099-09-02" }]));
    const scan = await db.one<{ id: string }>("select id from unmatched_scans where event_id = $1", [s.gbm]);
    expect(await db.fails("select resolve_unmatched_scan($1, 'dismiss')", [scan.id])).toMatch(/note is required/);
    const res = await db.one<{ r: { status: string } }>("select resolve_unmatched_scan($1, 'link', $2) r", [scan.id, s.alex]);
    expect(res.r.status).toBe("linked");
    expect(await count(db, "select count(*) c from attendance_records where event_id = $1", [s.gbm])).toBe(1);
    expect(await db.fails("select resolve_unmatched_scan($1, 'link', $2)", [scan.id, s.alex])).toMatch(/already been resolved/);
  }));

  it("converting a prospect keeps the same person and history", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.query("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'attended', 'manual')", [s.m100, s.casey]);
    const chair = await makeUser(db, ["membership_chair"]);
    await db.as(chair);
    const p = await db.one<{ id: string }>("select id from prospective_members where person_id = $1", [s.casey]);
    expect(await db.fails("select convert_prospect_to_member($1, '2099-10-01', $2, 'active', '')", [p.id, s.semester])).toMatch(/confirmed/);
    const m = await db.one<{ m: string }>("select convert_prospect_to_member($1, '2099-10-01', $2, 'active', 'Accepted at GBM') m", [p.id, s.semester]);
    const member = await db.one<{ person_id: string; member_since: string }>("select person_id, member_since::text from members where id = $1", [m.m]);
    expect(member).toEqual({ person_id: s.casey, member_since: "2099-10-01" });
    expect(await count(db, "select count(*) c from attendance_records where person_id = $1", [s.casey])).toBe(1);
    expect(await db.fails("select convert_prospect_to_member($1, '2099-10-01', $2, 'active', 'again please')", [p.id, s.semester])).toMatch(/Already converted/);
  }));

  it("email changes keep the identity and old emails still match", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await db.query("select set_primary_email($1, 'alex.new@test.edu')", [s.alex]);
    expect(await db.fails("select set_primary_email($1, 'cdiaz@test.edu')", [s.alex])).toMatch(/belongs to another person/);
    const sum = await commit(db, await createImport(db, [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02" }, { email: "alex.new@test.edu", event: "Test Meet the 100", date: "2099-09-03" }]));
    expect(sum.inserted).toBe(2);
    expect(await count(db, "select count(*) c from attendance_records where person_id = $1", [s.alex])).toBe(2);
    expect(await count(db, "select count(*) c from people where first_name = 'Alex' and last_name = 'Rivera'")).toBe(1);
  }));
});
