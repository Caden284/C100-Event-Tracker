import { afterAll, describe, expect, it } from "vitest";
import { createImport, getPool, hasDb, makeUser, seedBasics, withTx, type Db } from "./helpers";

const d = hasDb ? describe : describe.skip;
afterAll(async () => { if (hasDb) await getPool().end(); });

const absence = (db: Db, ev: string, person: string, excused: boolean, reason: string | null = null, note: string | null = null) =>
  db.query("select public.record_absence($1, $2, $3, $4, $5)", [ev, person, excused, reason, note]);
const excuses = async (db: Db, ev: string) =>
  Number((await db.one<{ c: string }>("select count(*) c from absence_excuses x join attendance_records r on r.id = x.attendance_record_id where r.event_id = $1", [ev])).c);
const status = async (db: Db, ev: string, person: string) =>
  (await db.one<{ status_key: string } | undefined>("select status_key from attendance_records where event_id = $1 and person_id = $2", [ev, person]))?.status_key;

d("Excused and unexcused absences", () => {
  it("records an excused absence with a reason, and switches it to unexcused", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await absence(db, s.gbm, s.alex, true, "work");
    expect(await status(db, s.gbm, s.alex)).toBe("excused");
    expect((await db.one<{ reason_key: string }>("select reason_key from absence_excuses x join attendance_records r on r.id = x.attendance_record_id where r.person_id = $1", [s.alex])).reason_key).toBe("work");
    await absence(db, s.gbm, s.alex, false);
    expect(await status(db, s.gbm, s.alex)).toBe("absent");
    expect(await excuses(db, s.gbm)).toBe(0);
  }));

  it("requires a reason, a note for 'Other', and a member who did not attend", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    expect(await db.fails("select public.record_absence($1, $2, true, null, null)", [s.gbm, s.alex])).toMatch(/Choose a reason/);
    expect(await db.fails("select public.record_absence($1, $2, true, 'other', '  ')", [s.gbm, s.alex])).toMatch(/short note/);
    expect(await db.fails("select public.record_absence($1, $2, true, 'illness', null)", [s.gbm, s.casey])).toMatch(/members only/);
    await db.query("select public.set_manual_attendance($1, $2, 'attended')", [s.gbm, s.alexa]);
    expect(await db.fails("select public.record_absence($1, $2, true, 'illness', null)", [s.gbm, s.alexa])).toMatch(/recorded as attending/);
  }));

  it("'Excused' can't be set without a reason through other paths", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    expect(await db.fails("select public.set_manual_attendance($1, $2, 'excused')", [s.gbm, s.alex])).toMatch(/Record an absence/);
    expect(await db.fails("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'excused', 'manual')", [s.gbm, s.alex])).toMatch(/reason is saved/);
    // A PIN export saying "Excused" is not trusted as an excuse.
    const imp = await createImport(db, [{ email: "arivera@test.edu", event: "Test GBM", date: "2099-09-02", status: "Excused" }]);
    await db.query("select public.commit_attendance_import($1)", [imp]);
    expect(await status(db, s.gbm, s.alex)).not.toBe("excused");
  }));

  it("checking in later clears the excuse", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await absence(db, s.gbm, s.alex, true, "class");
    await db.query("select public.set_manual_attendance($1, $2, 'attended', 'Arrived late, signed the paper sheet')", [s.gbm, s.alex]);
    expect(await status(db, s.gbm, s.alex)).toBe("attended");
    expect(await excuses(db, s.gbm)).toBe(0);
  }));

  it("the President can excuse absences without general attendance editing", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["president"]));
    await absence(db, s.gbm, s.alex, true, "mental_health");
    expect(await status(db, s.gbm, s.alex)).toBe("excused");
    expect(await db.fails("select public.set_manual_attendance($1, $2, 'attended')", [s.gbm, s.alexa])).toMatch(/Permission denied/);
  }));

  it("only excuse recorders and note readers see reasons; read-only officers can't record", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    await absence(db, s.gbm, s.alex, true, "illness", "Feeling sick");
    await db.as(await makeUser(db, ["officer"]));
    expect(await status(db, s.gbm, s.alex)).toBe("excused");
    expect(await excuses(db, s.gbm)).toBe(0);
    expect(await db.fails("select public.record_absence($1, $2, false)", [s.gbm, s.alexa])).toMatch(/Permission denied/);
    await db.as(await makeUser(db, ["treasurer"]));
    expect(await excuses(db, s.gbm)).toBe(0);
  }));
});

d("Strike suggestions", () => {
  it("a trigger can be confirmed once per member and semester, and dismissals are recorded", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.as(await makeUser(db, ["secretary"]));
    const member = (await db.one<{ id: string }>("select id from members where person_id = $1", [s.alex])).id;
    const ins = "insert into strike_records (member_id, semester_id, points, reason, source, trigger_key, event_id) values ($1, $2, 1, 'Unexcused absence: Test GBM', 'policy_suggestion', $3, $4)";
    await db.query(ins, [member, s.semester, `absence:${s.gbm}`, s.gbm]);
    expect(await db.fails(ins, [member, s.semester, `absence:${s.gbm}`, s.gbm])).toMatch(/duplicate|unique/);
    await db.query("insert into strike_dismissals (member_id, semester_id, trigger_key, reason) values ($1, $2, 'midterm', 'Excused late by the President')", [member, s.semester]);
    expect(await db.fails("insert into strike_dismissals (member_id, semester_id, trigger_key, reason) values ($1, $2, 'final', 'no')", [member, s.semester])).toMatch(/check/);
    await db.as(await makeUser(db, ["officer"]));
    expect(Number((await db.one<{ c: string }>("select count(*) c from strike_dismissals")).c)).toBe(0);
    expect(await db.fails("insert into strike_dismissals (member_id, semester_id, trigger_key, reason) values ($1, $2, 'dues', 'Paid in cash')", [member, s.semester])).toMatch(/row-level security/);
  }));
});
