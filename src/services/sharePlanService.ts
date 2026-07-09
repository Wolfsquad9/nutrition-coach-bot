/**
 * Share Plan Service
 *
 * Generates shareable links for locked plans and fetches shared plan data
 * via the get-shared-plan edge function.
 *
 * The get-shared-plan edge function now requires authentication.
 * This service sends the authenticated user's bearer token.
 */

import { supabase } from '@/integrations/supabase/client';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

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
 * Requires authentication — sends the bearer token.
 */
export async function fetchSharedPlan(
  versionId: string
): Promise<{ snapshot: PlanSnapshot | null; error: string | null }> {
  if (!SUPABASE_URL) {
    return {
      snapshot: null,
      error: 'Supabase env not configured: VITE_SUPABASE_URL must be set.',
    };
  }

  const token = await getAccessToken();
  if (!token) {
    return {
      snapshot: null,
      error: 'Not authenticated. Please sign in to view this plan.',
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shared-plan?versionId=${encodeURIComponent(versionId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
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
