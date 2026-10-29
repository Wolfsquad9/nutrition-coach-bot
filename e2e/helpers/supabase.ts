import { createClient } from '@supabase/supabase-js';

let _e2eClient: ReturnType<typeof createClient> | null = null;

/**
 * Fail-closed guard for the Meal Variety round-trip spec (P0-1).
 *
 * When `MEAL_VARIETY_E2E=1` is set, the Supabase URL MUST be loopback
 * (`127.0.0.1` or `localhost`). Any remote host — including `*.supabase.co` —
 * throws BEFORE any client is created, so no authentication, mutation, or
 * cleanup can reach a shared backend. Missing/invalid env also throws;
 * there is deliberately no silent fallback to production variables.
 *
 * Test-only: never imported by application code.
 */
export function assertMealVarietyLoopbackTarget(rawUrl: string | undefined): string {
  if (process.env.MEAL_VARIETY_E2E !== '1') return rawUrl ?? '';
  if (!rawUrl) {
    throw new Error(
      '[meal-variety-e2e] MEAL_VARIETY_E2E=1 is set but no Supabase URL is configured. ' +
        'Refusing to fall back to production variables.'
    );
  }
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    throw new Error('[meal-variety-e2e] unparseable Supabase URL. Refusing to proceed.');
  }
  // Sanitized: hostname only, never credentials or full URL.
  console.log(`[meal-variety-e2e] preflight target host: ${host}`);
  const loopback = host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost');
  if (!loopback) {
    throw new Error(
      `[meal-variety-e2e] refusing non-loopback target (host: ${host}). ` +
        'Point the test env at the local Supabase stack.'
    );
  }
  return rawUrl;
}

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
  const url = assertMealVarietyLoopbackTarget(process.env.VITE_SUPABASE_URL);
  // E2E cleanup RPCs delete from auth.users, which is RLS-restricted. An anon
  // key cannot do this. Use the service_role key for the cleanup client —
  // the trusted admin context that can bypass RLS. See the migration
  // 20260730000000_e2e_rpc_remediation.sql for the privilege change.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonymousKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || (!serviceRoleKey && !anonymousKey)) {
    throw new Error(
      'E2E cleanup requires VITE_SUPABASE_URL and either ' +
        'SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY in env',
    );
  }
  const key = serviceRoleKey ?? anonymousKey;
  _e2eClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _e2eClient;
}
