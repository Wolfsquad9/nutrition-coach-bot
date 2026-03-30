/**
 * Share Plan Service
 *
 * Generates shareable links for locked plans and fetches shared plan data
 * via the get-shared-plan edge function (no auth required for viewing).
 */

import { supabase } from '@/integrations/supabase/client';
import type { PlanSnapshot } from '@/domain/nutrition/snapshot';

const SUPABASE_URL = "https://ennbxdpthjtzsobnqvqw.supabase.co";

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
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shared-plan?versionId=${encodeURIComponent(versionId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVubmJ4ZHB0aGp0enNvYm5xdnF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjA2OTUsImV4cCI6MjA3MzUzNjY5NX0.QK19cuza0iptrdkoDctEI9iOOvx0tYzy_UPSPrm00dU',
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
