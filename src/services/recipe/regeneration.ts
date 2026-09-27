/**
 * Regeneration identity — deterministic seeds plus a session-independent
 * regeneration counter.
 *
 * Problem this solves (audit, Phase 1)
 * -----------------------------------
 * 1. The Daily Plan button passed no seed, so two consecutive generations
 *    produced the exact same plan.
 * 2. The weekly regeneration counter lived in a React `useRef`, so a component
 *    remount (navigate away/back) silently reset the sequence and the next
 *    click could reproduce an earlier plan.
 *
 * Guarantees
 * ----------
 * - Deterministic: the seed is a pure function of `(clientId, scope, count)`.
 *   Same inputs + same count ⇒ same seed ⇒ same plan (no uncontrolled
 *   randomness anywhere).
 * - Monotonic and session-independent: the counter is persisted in
 *   `localStorage`, so it survives remounts and reloads. Regeneration #1 and
 *   #2 can never intentionally reuse the same seed.
 * - Locked plans are untouched: nothing here reads or writes plan payloads.
 *
 * The plan version is deliberately NOT part of the seed identity. Including it
 * would restart the counter for every locked version, which could replay an
 * earlier candidate population — exactly the repetition this module exists to
 * prevent. A per-(client, scope) monotonic counter is strictly safer.
 */

export type RegenerationScope = 'weekly' | 'daily';

/** Minimal storage contract (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const REGENERATION_STORAGE_PREFIX = 'nutrition-regeneration-v2';

/** Kept identical to the optimizer's `SEED_PREFIX` so there is one namespace. */
export const REGENERATION_SEED_PREFIX = 'plan';

/** Storage key for one client + scope. */
export function regenerationStorageKey(clientId: string, scope: RegenerationScope): string {
  return `${REGENERATION_STORAGE_PREFIX}:${clientId}:${scope}`;
}

/**
 * Deterministic seed for one regeneration.
 *
 * Pure: identical arguments always produce an identical string.
 */
export function createRegenerationSeed(
  clientId: string,
  scope: RegenerationScope,
  regenerationCount: number,
): string {
  return `${REGENERATION_SEED_PREFIX}-${clientId}-${scope}-${regenerationCount}`;
}

/**
 * Safe read: a missing, negative, non-numeric or otherwise corrupt value is
 * treated as `0` — regeneration must never throw because of local storage.
 *
 * A previously recorded in-memory fallback wins over storage: if persisting
 * failed (private mode, quota, hardened context) the counter must keep
 * advancing in-session rather than silently restarting at `0` and replaying
 * the same seed.
 */
export function readRegenerationCount(storage: StorageLike | null, key: string): number {
  const fallback = fallbackCounts.get(key);
  if (fallback !== undefined) return fallback;
  if (!storage) return 0;
  try {
    const raw = storage.getItem(key);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Increment and persist. Returns the new count (never reuses a value). */
export function incrementRegenerationCount(storage: StorageLike | null, key: string): number {
  const next = readRegenerationCount(storage, key) + 1;
  if (storage) {
    try {
      storage.setItem(key, String(next));
      return next;
    } catch {
      // Storage full/blocked: keep the in-memory sequence monotonic anyway.
    }
  }
  fallbackCounts.set(key, next);
  return next;
}

/** `window.localStorage` when available, otherwise `null` (in-memory fallback). */
export function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Accessing localStorage can throw in hardened/private contexts.
  }
  return null;
}

/**
 * Consume the next regeneration identity for a client + scope.
 *
 * @returns the new `count` (feed it to the optimizer as `regenerationCount`)
 *          and the deterministic `seed` (feed it to single-day generation).
 */
export function nextRegenerationSeed(
  clientId: string,
  scope: RegenerationScope,
  options: { storage?: StorageLike | null } = {},
): { count: number; seed: string } {
  const storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
  const key = regenerationStorageKey(clientId, scope);
  const count = incrementRegenerationCount(storage, key);
  return { count, seed: createRegenerationSeed(clientId, scope, count) };
}

/**
 * In-memory fallback used only when `localStorage` is unavailable. Module
 * scoped so a single browser session still advances monotonically.
 */
const fallbackCounts = new Map<string, number>();
