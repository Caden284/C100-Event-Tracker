/**
 * Database integration-test helpers. Every test runs inside a transaction that is
 * ROLLED BACK, so tests never leave data behind. Officers are simulated the same
 * way Supabase does it: `role authenticated` + JWT claims (auth.uid()).
 */
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL && existsSync(".env.local")) {
  const m = readFileSync(".env.local", "utf8").match(/^TEST_DATABASE_URL=(.*)$/m);
  if (m) process.env.TEST_DATABASE_URL = m[1].trim();
}
export const DB_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!DB_URL;

export type Db = pg.PoolClient & { as: (user: string | null) => Promise<void>; one: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T>; fails: (sql: string, params?: unknown[]) => Promise<string> };

let pool: pg.Pool | null = null;
export function getPool() {
  pool ??= new pg.Pool({ connectionString: DB_URL, max: 2 });
  return pool;
}

export async function withTx(fn: (db: Db) => Promise<void>) {
  const client = (await getPool().connect()) as Db;
  client.as = async (user) => {
    await client.query("reset role");
    if (user === "anon") { await client.query("set local role anon"); return; }
    if (user) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    } else {
      await client.query("select set_config('request.jwt.claims', '', true)");
    }
  };
  client.one = async (sql, params) => (await client.query(sql, params)).rows[0];
  let sp = 0;
  client.fails = async (sql, params) => {
    const name = `sp${++sp}`;
    await client.query(`savepoint ${name}`);
    try {
      await client.query(sql, params);
    } catch (e) {
      await client.query(`rollback to savepoint ${name}`);
      return (e as Error).message;
    }
    await client.query(`release savepoint ${name}`);
    throw new Error(`Expected failure but succeeded: ${sql}`);
  };
  try {
    await client.query("begin");
    await fn(client);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Creates an auth user + profile with the given roles (as the database owner). */
export async function makeUser(db: Db, roles: string[], email = `${randomUUID().slice(0, 8)}@test.example`) {
  await db.as(null);
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, aud, role, instance_id) values ($1, $2, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')", [id, email]);
  for (const r of roles) await db.query("insert into public.user_roles (user_id, role_key) values ($1, $2)", [id, r]);
  return id;
}

/** Semester + events + a member and a prospect, created as the database owner. */
export async function seedBasics(db: Db) {
  await db.as(null);
  const sem = await db.one<{ id: string }>("insert into semesters (name, term, academic_year, start_date, end_date, status) values ('Test Fall 2099', 'Fall', '2099-2100', '2099-08-15', '2099-12-15', 'upcoming') returning id");
  const ev = async (name: string, cat: string | null, date = "2099-09-02", pin: string | null = name) => {
    const e = await db.one<{ id: string }>("insert into events (semester_id, name, event_date, category_key) values ($1, $2, $3, $4) returning id", [sem.id, name, date, cat]);
    if (pin) await db.query("insert into event_pin_names (event_id, pin_name, is_primary) values ($1, $2, true)", [e.id, pin]);
    return e.id;
  };
  const person = async (first: string, last: string, email: string | null, kind: "member" | "prospect") => {
    const p = await db.one<{ id: string }>("insert into people (first_name, last_name) values ($1, $2) returning id", [first, last]);
    if (email) await db.query("insert into person_identifiers (person_id, kind, value, is_primary) values ($1, 'email', $2, true)", [p.id, email]);
    if (kind === "member") await db.query("insert into members (person_id, status_key) values ($1, 'active')", [p.id]);
    else await db.query("insert into prospective_members (person_id) values ($1)", [p.id]);
    return p.id;
  };
  return {
    semester: sem.id,
    gbm: await ev("Test GBM", "meeting"),
    m100: await ev("Test Meet the 100", "recruitment", "2099-09-03"),
    service: await ev("Test Clean Up", "service", "2099-09-18", null),
    alex: await person("Alex", "Rivera", "arivera@test.edu", "member"),
    alexa: await person("Alexa", "Rivera", "arivera9@test.edu", "member"),
    casey: await person("Casey", "Diaz", "cdiaz@test.edu", "prospect"),
    ev,
    person,
  };
}

export type ImportRow = { first?: string; last?: string; email?: string | null; card?: string | null; event?: string | null; date?: string | null; status?: string | null };

/** Creates a preview import the same way the app does (via the officer's session). */
export async function createImport(db: Db, rows: ImportRow[], sha: string = randomUUID()) {
  const imp = await db.one<{ id: string }>("insert into attendance_imports (file_name, file_sha256, file_size, file_type, row_count) values ('test.csv', $1, 100, 'csv', $2) returning id", [sha, rows.length]);
  let n = 0;
  for (const r of rows) {
    const email = r.email ?? null;
    const group = `${(r.event ?? "__file__").toLowerCase().trim().replace(/\s+/g, " ")}|${r.date ?? ""}`;
    await db.query(
      `insert into attendance_import_rows (import_id, row_number, raw, first_name, last_name, email, email_normalized, card_id, pin_event_name, event_date, status_raw, group_key, fingerprint)
       values ($1, $2, '{}', $3, $4, $5, $6, $7, $8, $9, $10, $11, md5(random()::text))`,
      [imp.id, ++n, r.first ?? null, r.last ?? null, email, email ? email.trim().toLowerCase() : null, r.card ?? null, r.event ?? null, r.date ?? null, r.status === undefined ? "Attended" : r.status, group],
    );
  }
  return imp.id;
}
