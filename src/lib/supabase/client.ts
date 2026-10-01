import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/types/database";

/** Supabase client for Client Components (admin dashboard, realtime board). */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY());
}
