import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_URL } from "@/lib/env";

/**
 * PRIVILEGED client using the service-role key. It bypasses Row Level Security.
 * Only ever used on the server, and only AFTER the caller's permission has been
 * verified with their own session (see requirePermission). Used for: inviting
 * officers, full backups and restores. Never import this from a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server. It is required for user invitations and backups.");
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
