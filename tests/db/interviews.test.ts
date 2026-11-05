import { afterAll, describe, expect, it } from "vitest";
import { getPool, hasDb, makeUser, seedBasics, withTx, type Db } from "./helpers";

const d = hasDb ? describe : describe.skip;
afterAll(async () => { if (hasDb) await getPool().end(); });

const RUBRIC = { rubric: [{ key: "motivation", label: "Motivation" }, { key: "service", label: "Service" }] };

async function setup(db: Db) {
  const s = await seedBasics(db);
  const coord = await makeUser(db, ["membership_chair"]);
  const iv1 = await makeUser(db, ["officer"]);
  const iv2 = await makeUser(db, ["officer"]);
  const admin = await makeUser(db, ["super_admin"]);
  await db.as(coord);
  const cycle = (await db.one<{ id: string }>("insert into intake_cycles (name, spots, config) values ('Test Intake', 2, $1) returning id", [RUBRIC])).id;
  const app = (await db.one<{ id: string }>("insert into intake_applicants (cycle_id, person_id, interviewer_id) values ($1, $2, $3) returning id", [cycle, s.casey, iv1])).id;
  return { s, coord, iv1, iv2, admin, cycle, app };
}
const score = (db: Db, app: string, scores: object, extra = "") =>
  db.query(`insert into interview_scores (applicant_id, scores${extra ? ", recommendation, submitted_at" : ""}) values ($1, $2${extra ? ", 'yes', now()" : ""})
            on conflict (applicant_id, interviewer_id) do update set scores = excluded.scores`, [app, scores]);

d("Intake interviews", () => {
  it("adding an applicant moves their prospect record to interviewing", () => withTx(async (db) => {
    const { s } = await setup(db);
    await db.as(null);
    expect((await db.one<{ status: string }>("select status from prospective_members where person_id = $1", [s.casey])).status).toBe("interviewing");
  }));

  it("scores are only allowed while interviewing, by the assigned interviewer, 1–5 on the rubric", () => withTx(async (db) => {
    const { coord, iv1, iv2, cycle, app } = await setup(db);
    await db.as(iv1);
    expect(await db.fails("insert into interview_scores (applicant_id, scores) values ($1, '{\"motivation\":4}')", [app])).toMatch(/not open yet/);
    await db.as(coord);
    await db.query("update intake_cycles set status = 'interviewing' where id = $1", [cycle]);
    await db.as(iv2);
    expect(await db.fails("insert into interview_scores (applicant_id, scores) values ($1, '{\"motivation\":4}')", [app])).toMatch(/assigned interviewer/);
    await db.as(iv1);
    expect(await db.fails("insert into interview_scores (applicant_id, scores) values ($1, '{\"motivation\":6}')", [app])).toMatch(/1 to 5/);
    expect(await db.fails("insert into interview_scores (applicant_id, scores) values ($1, '{\"vibes\":5}')", [app])).toMatch(/Unknown rubric/);
    expect(await db.fails("insert into interview_scores (applicant_id, scores, recommendation, submitted_at) values ($1, '{\"motivation\":4}', 'yes', now())", [app])).toMatch(/Score every criterion/);
    await score(db, app, { motivation: 4, service: 5 }, "submit");
  }));

  it("scores are blind until deliberation — even for super admins and the coordinator", () => withTx(async (db) => {
    const { coord, iv1, iv2, admin, cycle, app } = await setup(db);
    await db.as(coord);
    await db.query("update intake_cycles set status = 'interviewing' where id = $1", [cycle]);
    await db.as(iv1);
    await score(db, app, { motivation: 3 });
    const count = async () => Number((await db.one<{ c: string }>("select count(*) c from interview_scores")).c);
    expect(await count()).toBe(1);
    for (const u of [iv2, coord, admin]) { await db.as(u); expect(await count()).toBe(0); }
    await db.as(null);
    expect(Number((await db.one<{ c: string }>("select count(*) c from audit_logs where table_name = 'interview_scores' and changes is not null")).c)).toBe(0);
    await db.as(coord);
    await db.query("update intake_cycles set status = 'deliberation' where id = $1", [cycle]);
    for (const u of [iv2, coord, admin]) { await db.as(u); expect(await count()).toBe(1); }
    await db.as(iv1);
    expect(await db.fails("update interview_scores set scores = '{\"motivation\":5}' where applicant_id = $1", [app])).toMatch(/locked/);
    await db.as(coord);
    expect(await db.fails("update intake_cycles set status = 'interviewing' where id = $1", [cycle])).toMatch(/cannot move back/);
  }));

  it("officers can claim an open interview or hand back their own, but not change details", () => withTx(async (db) => {
    const { s, coord, iv1, iv2, cycle, app } = await setup(db);
    await db.as(coord);
    await db.query("update intake_cycles set status = 'interviewing' where id = $1", [cycle]);
    const open = (await db.one<{ id: string }>("insert into intake_applicants (cycle_id, person_id) values ($1, $2) returning id", [cycle, s.alex])).id;
    await db.as(iv2);
    await db.query("update intake_applicants set interviewer_id = $2 where id = $1", [open, iv2]);
    expect((await db.one<{ interviewer_id: string }>("select interviewer_id from intake_applicants where id = $1", [open])).interviewer_id).toBe(iv2);
    await db.query("update intake_applicants set status = 'no_show' where id = $1", [open]);
    expect(await db.fails("update intake_applicants set gpa = 4.0 where id = $1", [open])).toMatch(/coordinator/);
    // iv2 cannot take iv1's interview (row is invisible to update → no change)
    await db.query("update intake_applicants set interviewer_id = $2 where id = $1", [app, iv2]);
    await db.as(null);
    expect((await db.one<{ interviewer_id: string }>("select interviewer_id from intake_applicants where id = $1", [app])).interviewer_id).toBe(iv1);
    await db.as(iv1);
    expect(await db.fails("insert into intake_applicants (cycle_id, person_id) values ($1, $2)", [cycle, s.alexa])).toMatch(/coordinator|row-level/);
    expect(await db.fails("update intake_applicants set decision = 'offer' where id = $1", [app])).toMatch(/deliberation/);
  }));

  it("counts engagement points from attendance up to the cutoff", () => withTx(async (db) => {
    const { s, coord, cycle } = await setup(db);
    await db.as(null);
    await db.query("insert into attendance_records (event_id, person_id, status_key, source) values ($1, $2, 'attended', 'manual'), ($3, $2, 'attended', 'manual'), ($4, $2, 'attended', 'manual')", [s.gbm, s.casey, s.m100, s.service]);
    await db.as(coord);
    await db.query("select count_intake_engagement($1, '2099-09-10')", [cycle]);
    let r = await db.one<{ engagement_events: number; engagement_points: number }>("select engagement_events, engagement_points from intake_applicants where cycle_id = $1", [cycle]);
    expect(r).toEqual({ engagement_events: 2, engagement_points: 1 });
    await db.query("select count_intake_engagement($1, '2099-12-31')", [cycle]);
    r = await db.one("select engagement_events, engagement_points from intake_applicants where cycle_id = $1", [cycle]);
    expect(r).toEqual({ engagement_events: 3, engagement_points: 3 });
  }));
});
