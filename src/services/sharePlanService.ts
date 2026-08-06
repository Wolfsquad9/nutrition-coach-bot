/**
 * Share Plan Service
 *
 * Generates shareable links for locked plans and fetches shared plan data
 * via the get-shared-plan edge function.
 *
 * Architecture (see docs/architecture/shared-plan.md):
 *   - Public shared plans work WITHOUT authentication.
 *   - The UUID in the URL is the authorization boundary. Possession of the
 *     link grants read-only access to the locked snapshot.
 *   - The endpoint is intentionally PUBLIC. We always use the anon apikey.
 *     There is no bearer-token branching on this code path.
 *   - This function never sends a JWT. It never touches an authenticated
 *     client. There is no path from here into a coach workspace.
 */

import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Generate a shareable URL for a locked plan version.
 * The versionId (UUID) is the share identifier and the authorization token.
 */
export function generateShareLink(versionId: string): string {
  return `${window.location.origin}/plan/${versionId}`;
}

/**
 * Fetch a shared plan snapshot via the edge function.
 *
 * Always anonymous. Always uses apikey (not bearer). Always passes the
 * UUID as the `token` query parameter. The RPC is the entire security
 * boundary — see get_shared_plan_snapshot.
 */
export async function fetchSharedPlan(
  versionId: string
): Promise<{ snapshot: PlanSnapshot | null; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      snapshot: null,
      error:
        'Supabase env not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.',
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shared-plan?token=${encodeURIComponent(versionId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
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