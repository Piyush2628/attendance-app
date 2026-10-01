import "server-only";

import { createClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cookie-less anon client for the worker RPCs on /punch.
 * Workers never have a Supabase Auth session; the RPCs check PINs / tokens.
 */
export function createAnonClient() {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
