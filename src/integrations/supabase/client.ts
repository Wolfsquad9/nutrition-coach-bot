// Supabase client singleton. Reads URL + anon key from Vite env vars.
// Anon key is safe to expose in client code (it's a public credential by
// design), but we read it from env to centralize config and avoid hard-coding.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Use a stub URL/anon key when env vars are missing so that import-time
// `createClient()` does not throw. Test environments that don't set the env
// vars will load a non-functional client; the createClient() throw above
// would otherwise abort module evaluation and break pure-function tests
// that import transitively (e.g. progress/relativeTime).
//
// In real dev/prod, missing env vars are surfaced via the dev console.error
// below and via runtime request failures, both of which point the developer
// at the missing config.
const STUB_URL = 'https://env-not-configured.invalid';
const STUB_KEY = 'env-not-configured';

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'See .env.example for the required env vars.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  SUPABASE_URL ?? STUB_URL,
  SUPABASE_ANON_KEY ?? STUB_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);
