/**
 * Creates (or promotes) the FIRST super administrator.
 *
 *   npm run admin:bootstrap -- --email you@student.gsu.edu --name "Your Name"
 *
 * Security:
 *   * Needs SUPABASE_SERVICE_ROLE_KEY, which only exists on your computer / the
 *     server — never in the browser and never in Git.
 *   * Refuses to run once any super administrator exists (use the Settings →
 *     Users page instead), unless you pass --force on purpose.
 *   * Generates a strong one-time password and prints it ONCE. Change it after
 *     your first sign-in (Account → password reset or Supabase dashboard).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const force = process.argv.includes("--force");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: npm run admin:bootstrap -- --email you@example.edu --name "Full Name"');
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count, error: countErr } = await admin.from("user_roles").select("*", { count: "exact", head: true }).eq("role_key", "super_admin");
  if (countErr) throw new Error(`Could not read roles (did you run the database migrations?): ${countErr.message}`);
  if ((count ?? 0) > 0 && !force) {
    throw new Error("A super administrator already exists. Add more officers from Settings → Users & roles. (Use --force only if you are locked out.)");
  }

  // Find or create the auth user.
  let userId: string | null = null;
  let password: string | null = null;
  for (let page = 1; page < 50 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    password = randomBytes(12).toString("base64url") + "9a";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name ?? null } });
    if (error) throw error;
    userId = data.user.id;
  }
  if (name) await admin.from("profiles").update({ full_name: name }).eq("id", userId);
  const { error: roleErr } = await admin.from("user_roles").upsert({ user_id: userId, role_key: "super_admin" });
  if (roleErr) throw roleErr;
  await admin.from("audit_logs").insert({ action: "bootstrap.super_admin", table_name: "user_roles", record_id: `${userId}:super_admin`, metadata: { email } });

  console.log(`\n✔ ${email} is a super administrator.`);
  if (password) {
    console.log("\n  One-time password (shown only once — store it safely, then change it):");
    console.log(`  ${password}\n`);
  } else {
    console.log("  The account already existed; its password was not changed.\n");
  }
}

main().catch((e) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
