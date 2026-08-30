/**
 * Phase 10 — P0: the lock_nutrition_plan RPC must enforce the mandatory lock
 * period SERVER-SIDE, so a caller who bypasses the UI cannot create an early
 * re-lock.
 *
 * These are STATIC/schema guards over the forward migration. Live Supabase RPC
 * execution is not available in the CI vitest environment, so we assert the
 * strongest static contract here and document that limitation. The invariant
 * covered:
 *   - authenticated caller (auth.uid)
 *   - caller authorized for the client (Not authorized ...)
 *   - current lock period checked from the canonical snapshot meta.lockedUntil
 *   - invalid early re-lock rejects atomically (RAISE ... mandatory lock period)
 *   - idempotency preserved (idempotency_key, RETURN before the lock-period check)
 *   - execute grants preserved (authenticated only)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260824090000_enforce_nutrition_plan_lock_period.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

describe('lock_nutrition_plan lock-period enforcement (static guard)', () => {
  it('the migration defines the lock RPC as SECURITY DEFINER for authenticated callers only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.lock_nutrition_plan/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).toMatch(/Not authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.lock_nutrition_plan\(UUID, UUID, JSONB, JSONB, TEXT, UUID\) FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.lock_nutrition_plan\(UUID, UUID, JSONB, JSONB, TEXT, UUID\) TO authenticated/);
  });

  it('keeps the client authorization check', () => {
    expect(sql).toMatch(/Not authorized to lock a nutrition plan for this client/);
  });

  it('checks the current lock period from the canonical snapshot meta server-side', () => {
    // Reads the current (highest) version's lockedUntil and rejects a future one.
    expect(sql).toMatch(/#>> '\{meta,lockedUntil\}'/);
    expect(sql).toMatch(/ORDER BY version_number DESC/);
    expect(sql).toMatch(/mandatory lock period/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('only blocks when the current version is still inside its lock period', () => {
    // Guard is conditional: v_plan_id IS NOT NULL + locked_until > now().
    expect(sql).toMatch(/IF v_plan_id IS NOT NULL THEN/);
    expect(sql).toMatch(/v_current_locked_until > now\(\)/);
  });

  it('preserves idempotency (idempotency_key fast-path runs BEFORE the guard)', () => {
    expect(sql).toMatch(/p_idempotency_key/);
    // The idempotent RETURN must appear before the lock-period RAISE in the body.
    const idemReturn = sql.indexOf('RETURN QUERY SELECT TRUE, v_existing');
    const lockCheck = sql.indexOf('mandatory lock period');
    expect(idemReturn).toBeGreaterThan(-1);
    expect(lockCheck).toBeGreaterThan(-1);
    expect(idemReturn).toBeLessThan(lockCheck);
  });

  it('does not regress snapshot immutability triggers (unchanged column-set)', () => {
    // The migration does not alter plan_versions triggers; it only adds the
    // lock-period guard inside the RPC. No DROP of the immutability trigger.
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS prevent_locked_snapshot_overwrite/);
  });

  // F-02 regression: the lock-period guard must filter archived versions so a
  // soft-archived historical version can never extend the active lock period.
  // This matches the existing client_visible_locked_plan_versions view and the
  // get-shared-plan RPC, both of which filter archived = false.
  it('excludes archived plan versions from the lock-period check (F-02)', () => {
    // Locate the lock-period guard SELECT (reads current version's lockedUntil).
    const guardStart = sql.indexOf('#>> \'{meta,lockedUntil}\'');
    expect(guardStart).toBeGreaterThan(-1);
    const guardBlock = sql.slice(guardStart, guardStart + 500);
    expect(guardBlock).toMatch(/AND archived = false/);
    // It must sit alongside the existing locked_snapshot_json IS NOT NULL filter.
    const archivedIdx = guardBlock.indexOf('AND archived = false');
    const snapshotIdx = guardBlock.indexOf('AND locked_snapshot_json IS NOT NULL');
    expect(archivedIdx).toBeGreaterThan(-1);
    expect(snapshotIdx).toBeGreaterThan(-1);
  });
});