/**
 * Snapshot Persistence Service
 * 
 * Handles persisting and retrieving PlanSnapshot JSON from plan_versions.
 * Snapshots are write-once: once set, they are never updated.
 * 
 * This service is the ONLY place that reads/writes locked_snapshot_json.
 */

import { supabase } from '@/integrations/supabase/client';
import type { PlanSnapshot, SnapshotBuildInput } from '@/domain/nutrition/snapshot';
import { buildPlanSnapshot } from '@/domain/nutrition/snapshot';

/**
 * Persist a pre-built snapshot JSON to a plan version.
 * Write-once: will NOT overwrite an existing snapshot.
 */
export async function persistSnapshot(
  versionId: string,
  snapshot: PlanSnapshot
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Check if snapshot already exists (write-once guard)
    const { data: existing, error: checkError } = await supabase
      .from('plan_versions')
      .select('locked_snapshot_json')
      .eq('id', versionId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing snapshot:', checkError);
      return { success: false, error: checkError.message };
    }

    if (existing?.locked_snapshot_json) {
      // Already has a snapshot — write-once semantics, skip silently
      return { success: true, error: null };
    }

    const snapshotJson = JSON.parse(JSON.stringify(snapshot));

    const { error: updateError } = await supabase
      .from('plan_versions')
      .update({ locked_snapshot_json: snapshotJson })
      .eq('id', versionId);

    if (updateError) {
      console.error('Error persisting snapshot:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('Failed to persist snapshot:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch a persisted snapshot from a plan version.
 * Returns null if no snapshot is stored.
 */
export async function fetchPersistedSnapshot(
  versionId: string
): Promise<{ snapshot: PlanSnapshot | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('plan_versions')
      .select('locked_snapshot_json')
      .eq('id', versionId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching snapshot:', error);
      return { snapshot: null, error: error.message };
    }

    if (!data?.locked_snapshot_json) {
      return { snapshot: null, error: null };
    }

    return {
      snapshot: data.locked_snapshot_json as unknown as PlanSnapshot,
      error: null,
    };
  } catch (err: any) {
    console.error('Failed to fetch snapshot:', err);
    return { snapshot: null, error: err.message };
  }
}

/**
 * Build a snapshot from available data and persist it.
 * Used for backfill: when a locked plan has no snapshot yet.
 */
export async function buildAndPersistSnapshot(
  versionId: string,
  input: SnapshotBuildInput
): Promise<{ snapshot: PlanSnapshot; error: string | null }> {
  const snapshot = buildPlanSnapshot(input);
  const result = await persistSnapshot(versionId, snapshot);
  return { snapshot, error: result.error };
}
