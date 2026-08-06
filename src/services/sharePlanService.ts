/**
 * Share Plan Service
 *
 * Generates shareable links for locked plans and fetches shared plan data
 * via the get-shared-plan edge function.
 *
 * RESTORED Sprint 1.75 behavior:
 *   - Public shared plans work WITHOUT authentication
 *   - Uses apikey header (no bearer required) for anonymous access
 *   - Authenticated users still get bearer token for RLS-enforced access
 */

import { supabase } from '@/integrations/supabase/client';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Generate a shareable URL for a locked plan version.
 * The versionId itself acts as the share identifier.
 */
export function generateShareLink(versionId: string): string {
  return `${window.location.origin}/plan/${versionId}`;
}

/**
 * Get the current session's access token for API calls.
 */
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fetch a shared plan snapshot via edge function.
 * PUBLIC — does NOT require authentication (Sprint 1.75 behavior).
 * Uses apikey header for anonymous access.
 */
export async function fetchSharedPlan(
  versionId: string
): Promise<{ snapshot: PlanSnapshot | null; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      snapshot: null,
      error: 'Supabase env not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.',
    };
  }

  const token = await getAccessToken();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // If authenticated, send bearer token for RLS-respected access
    // If anonymous, use apikey header (Sprint 1.75 behavior)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // Sprint 1.75: anonymous access via apikey
      headers['apikey'] = SUPABASE_ANON_KEY;
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shared-plan?versionId=${encodeURIComponent(versionId)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const errorMsg = (body as { error?: string }).error || `HTTP ${response.status}`;
      return { snapshot: null, error: errorMsg };
    }

    const data: { snapshot: unknown } = await response.json();
    return { snapshot: data.snapshot as PlanSnapshot, error: null };
  } catch (err) {
    return {
      snapshot: null,
      error: err instanceof Error ? err.message : 'Failed to fetch shared plan',
    };
  }
}