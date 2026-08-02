// Supabase client singleton. Reads URL + anon key from Vite env vars.
// Anon key is safe to expose in client code (it's a public credential by
// design), but we read it from env to centralize config and avoid hard-coding.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Lazy initialization to avoid import-time failures and TS1343 errors in
// test compilation. The client is created on first access.
let _supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

function initializeClient(): ReturnType<typeof createClient<Database>> {
  // Return cached client if already initialized
  if (_supabaseClient) return _supabaseClient;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  // In development/preview without env vars, use stub URLs to allow the app to load.
  // Production deployments will have env vars set via Supabase integration.
  // Actual API calls will fail with network errors that clearly indicate missing config.
  const url = SUPABASE_URL || 'https://env-not-configured.invalid';
  const key = SUPABASE_ANON_KEY || 'env-not-configured';
  const hasConfig = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

  if (import.meta.env.DEV && !hasConfig) {
    console.warn(
      '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'See .env.example for required env vars. Using stub URLs for development.'
    );
  }

  try {
    _supabaseClient = createClient<Database>(url, key, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Disable the default navigator.locks-based cross-tab auth
        // coordination. Root cause of a confirmed production bug: if any
        // auth call (e.g. signOut()) is abandoned client-side via a
        // timeout/Promise.race while the underlying request is still
        // in flight, the exclusive lock it holds
        // (lock:sb-<project-ref>-auth-token) is never released — which
        // then blocks EVERY subsequent auth-dependent call, in EVERY tab
        // and browser, on this origin, until the browser process is fully
        // restarted. Our own AuthProvider (useAuth.tsx) already manages
        // auth state via onAuthStateChange + React context, so we don't
        // rely on this library-level cross-tab lock for correctness.
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    });
  } catch (error) {
    // In development/preview, suppress errors from stub URLs failing to initialize
    if (import.meta.env.DEV && !hasConfig) {
      console.debug('[supabase] Stub client initialization (expected without config)');
      // Create a minimal stub client that won't crash
      _supabaseClient = createClient<Database>(url, key);
    } else {
      throw error;
    }
  }

  return _supabaseClient;
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
// 
// The client is lazily initialized on first access. If env vars are missing,
// an error is thrown at runtime with a clear message pointing to .env.example.

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export const supabase = new Proxy({} as SupabaseClient, {
  get(target: SupabaseClient, prop: PropertyKey): unknown {
    const client = initializeClient();
    return Reflect.get(client, prop);
  },
}) as SupabaseClient;
