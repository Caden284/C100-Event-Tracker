import { afterAll, describe, expect, it } from "vitest";
import { getPool, hasDb, makeUser, seedBasics, withTx } from "./helpers";

const d = hasDb ? describe : describe.skip;
afterAll(async () => { if (hasDb) await getPool().end(); });

d("authentication & Row Level Security", () => {
  it("anonymous visitors cannot read private records", () => withTx(async (db) => {
    await seedBasics(db);
    await db.as("anon");
    for (const t of ["members", "people", "person_identifiers", "attendance_records", "member_notes", "audit_logs", "profiles"]) {
      expect(await db.fails(`select * from ${t} limit 1`)).toMatch(/permission denied/);
    }
  }));

  it("a signed-in user with no role sees nothing", () => withTx(async (db) => {
    await seedBasics(db);
    const u = await makeUser(db, []);
    await db.as(u);
    expect((await db.query("select * from members")).rowCount).toBe(0);
    expect((await db.query("select * from events")).rowCount).toBe(0);
  }));

  it("read-only officers can view members but not notes, dues or discipline", () => withTx(async (db) => {
    const s = await seedBasics(db);
    await db.query("insert into member_notes (member_id, body) select id, 'private' from members where person_id = $1", [s.alex]);
    const u = await makeUser(db, ["officer"]);
    await db.as(u);
    expect(Number((await db.one("select count(*) c from members where person_id = $1", [s.alex])).c)).toBe(1);
    expect((await db.query("select * from member_notes")).rowCount).toBe(0);
    expect((await db.query("select * from member_dues")).rowCount).toBe(0);
    expect((await db.query("select * from disciplinary_actions")).rowCount).toBe(0);
    const res = await db.query("update members set committee = 'x' where person_id = $1", [s.alex]);
    expect(res.rowCount).toBe(0); // RLS silently filters the write
  }));

  it("officers can only do what their role allows", () => withTx(async (db) => {
    await seedBasics(db);
    const treasurer = await makeUser(db, ["treasurer"]);
    await db.as(treasurer);
    expect(await db.fails("insert into attendance_imports (file_name, file_sha256, file_size, file_type) values ('x', 'y', 1, 'csv')")).toMatch(/row-level security/);
    expect(await db.fails("select public.commit_attendance_import(gen_random_uuid())")).toMatch(/attendance.import is required/);
    const secretary = await makeUser(db, ["secretary"]);
    await db.as(secretary);
    expect((await db.query("insert into attendance_imports (file_name, file_sha256, file_size, file_type) values ('x', 'y', 1, 'csv') returning id")).rowCount).toBe(1);
  }));

  it("prevents privilege escalation and lock-out", () => withTx(async (db) => {
    const admin = await makeUser(db, ["super_admin"]);
    const sec = await makeUser(db, ["secretary"]);
    const president = await makeUser(db, ["president"]);
    await db.query("insert into role_permissions values ('president', 'users.manage')");
    await db.as(sec);
    expect(await db.fails("insert into user_roles (user_id, role_key) values ($1, 'super_admin')", [sec])).toMatch(/row-level security|Only a super administrator/);
    expect(await db.fails("insert into user_roles (user_id, role_key) values ($1, 'president')", [sec])).toMatch(/row-level security/);
    expect(await db.fails("insert into role_permissions values ('secretary', 'backup.manage')")).toMatch(/row-level security/);
    await db.as(president); // can manage users, but still cannot mint super admins
    expect(await db.fails("insert into user_roles (user_id, role_key) values ($1, 'super_admin')", [president])).toMatch(/Only a super administrator/);
    await db.as(null); // make this the only active super administrator (rolled back afterwards)
    await db.query("update profiles set is_active = false where id <> $1 and id in (select user_id from user_roles where role_key = 'super_admin')", [admin]);
    await db.as(admin);
    expect(await db.fails("delete from user_roles where user_id = $1 and role_key = 'super_admin'", [admin])).toMatch(/last active super administrator/);
  }));

  it("role changes take effect immediately", () => withTx(async (db) => {
    await seedBasics(db);
    const u = await makeUser(db, []);
    await db.as(u);
    expect((await db.query("select * from members")).rowCount).toBe(0);
    await db.as(null);
    await db.query("insert into user_roles (user_id, role_key) values ($1, 'officer')", [u]);
    await db.as(u);
    expect((await db.query("select * from members")).rowCount).toBeGreaterThan(0);
    await db.as(null);
    await db.query("update profiles set is_active = false where id = $1", [u]);
    await db.as(u);
    expect((await db.query("select * from members")).rowCount).toBe(0);
  }));

  it("the audit log is append-only and records changes with reasons", () => withTx(async (db) => {
    const s = await seedBasics(db);
    const sec = await makeUser(db, ["secretary", "president"]);
    await db.as(sec);
    expect(await db.fails("update members set status_key = 'inactive' where person_id = $1", [s.alex])).toMatch(/reason is required/);
    await db.query("update members set status_key = 'inactive', change_reason = 'Studying abroad' where person_id = $1", [s.alex]);
    const log = await db.one<{ reason: string; actor_id: string }>("select reason, actor_id from audit_logs where table_name = 'members' order by id desc limit 1");
    expect(log).toMatchObject({ reason: "Studying abroad", actor_id: sec });
    expect(await db.fails("delete from audit_logs")).toMatch(/permission denied/);
    expect(await db.fails("update audit_logs set reason = 'x'")).toMatch(/permission denied/);
    expect(await db.fails("insert into audit_logs (action) values ('fake')")).toMatch(/permission denied/);
  }));

  it("only internal links can be sent as notifications", () => withTx(async (db) => {
    const sec = await makeUser(db, ["secretary"]);
    await db.as(sec);
    expect(await db.fails("select notify_permission('members.read', 't', 'hi', null, 'https://evil.example')")).toMatch(/inside the app/);
    await db.query("select notify_permission('members.read', 't', 'hi', null, '/members')");
  }));
});
