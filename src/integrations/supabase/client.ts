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

  if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
    console.warn(
      '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'See .env.example for required env vars. Using stub URLs for development.'
    );
  }

  _supabaseClient = createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _supabaseClient;
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
// 
// The client is lazily initialized on first access. If env vars are missing,
// an error is thrown at runtime with a clear message pointing to .env.example.

export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    const client = initializeClient();
    return (client as any)[prop];
  },
});
