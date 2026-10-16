import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertPublicEnv } from "@/lib/env";

/**
 * Supabase client acting AS THE SIGNED-IN OFFICER. Every query it makes is
 * subject to Row Level Security, so it can only see/do what that officer's
 * roles allow. Use this for all normal reads and writes.
 */
export async function createClient() {
  // Read the request first: it marks every page using this client as per-request
  // (never prerendered at build time), so a build without env vars still succeeds
  // and the missing configuration is reported at request time instead.
  const cookieStore = await cookies();
  assertPublicEnv();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;
