/**
 * Share Plan Service
 *
 * Generates shareable links for locked plans and fetches shared plan data
 * via the get-shared-plan edge function (no auth required for viewing).
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
 * Fetch a shared plan snapshot via edge function (no auth required).
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

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shared-plan?versionId=${encodeURIComponent(versionId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
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
