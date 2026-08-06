import { createClient } from '@supabase/supabase-js';

let _e2eClient: ReturnType<typeof createClient> | null = null;

/**
 * Fresh, unauthenticated Supabase client for E2E test cleanup.
 *
 * Built independently of the app's singleton (src/integrations/supabase/client.ts)
 * so the cleanup fixture never inherits a signed-in user from the page
 * under test. Calls fire as the `anon` role, which is why the safety-net
 * RPCs (public.e2e_force_delete_test_user, public.e2e_test_user_exists)
 * are granted to `anon, authenticated` — see the migration for context.
 */
export function getE2eSupabaseClient() {
  if (_e2eClient) return _e2eClient;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'E2E cleanup requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env'
    );
  }
  _e2eClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _e2eClient;
}
