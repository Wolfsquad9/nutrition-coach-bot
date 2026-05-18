/**
 * Plan Snapshot — immutable, fully-resolved representation of a nutrition plan.
 *
 * A snapshot is the single data shape that every distribution channel
 * (PDF, email, shareable link, WhatsApp) operates on.
 *
 * Invariants:
 *  1. A snapshot is always derived from a LOCKED or EXPIRED plan version.
 *  2. Once built, a snapshot is never mutated — exporters receive `Readonly`.
 *  3. `payloadHash` enables integrity verification across channels.
 */

import type { MealPlan, NutritionMetrics, GroceryItem } from '@/types';
import type { ShareablePlanIdentifier } from './planLifecycle';

// ============================================================================
// SNAPSHOT TYPE
// ============================================================================

export interface PlanSnapshot {
  /** Immutable version reference */
  readonly identifier: ShareablePlanIdentifier;

  /** Client display info (no PII beyond name) */
  readonly client: SnapshotClientInfo;

  /** Resolved macro targets */
  readonly metrics: Readonly<NutritionMetrics>;

  /** Full 7-day meal plan, fully expanded */
  readonly weeklyPlan: ReadonlyArray<Readonly<MealPlan>>;

  /** Aggregated grocery list */
  readonly groceryList: ReadonlyArray<Readonly<GroceryItem>>;

  /** Plan metadata */
  readonly meta: SnapshotMeta;
}

export interface SnapshotClientInfo {
  readonly firstName: string;
  readonly lastName: string;
  readonly goal: string;
  readonly activityLevel: string;
}

export interface SnapshotMeta {
  readonly planName: string;
  readonly versionNumber: number;
  readonly createdAt: string;   // ISO-8601
  readonly lockedAt: string;    // ISO-8601
  readonly lockedUntil: string; // ISO-8601
  readonly generatedBy: string; // "coach" | system identifier
}


// ============================================================================
// DEEP IMMUTABILITY
// ============================================================================

/**
 * Recursively freeze JSON-compatible snapshot structures.
 * Uses WeakSet cycle protection so accidental object cycles cannot recurse forever.
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }

  const objectValue = value as object;

  if (seen.has(objectValue)) {
    return value;
  }

  seen.add(objectValue);

  for (const nestedValue of Object.values(objectValue)) {
    deepFreeze(nestedValue, seen);
  }

  return Object.freeze(value);
}

// ============================================================================
// SNAPSHOT BUILDER (deterministic, pure)
// ============================================================================

export interface SnapshotBuildInput {
  identifier: ShareablePlanIdentifier;
  client: SnapshotClientInfo;
  metrics: NutritionMetrics;
  weeklyPlan: MealPlan[];
  groceryList: GroceryItem[];
  planName: string;
  versionNumber: number;
  createdAt: string;
  generatedBy: string;
}

/**
 * Build an immutable PlanSnapshot from resolved domain data.
 * Pure function — no side effects, no I/O.
 */
export function buildPlanSnapshot(input: SnapshotBuildInput): PlanSnapshot {
  return deepFreeze<PlanSnapshot>({
    identifier: { ...input.identifier },
    client: { ...input.client },
    metrics: { ...input.metrics },
    weeklyPlan: input.weeklyPlan.map(day => ({ ...day })),
    groceryList: input.groceryList.map(item => ({ ...item })),
    meta: {
      planName: input.planName,
      versionNumber: input.versionNumber,
      createdAt: input.createdAt,
      lockedAt: input.identifier.lockedAt.toISOString(),
      lockedUntil: input.identifier.lockedUntil.toISOString(),
      generatedBy: input.generatedBy,
    },
  });
}
