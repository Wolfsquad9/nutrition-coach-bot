/**
 * Plan Lifecycle State Machine
 * 
 * Formalizes the nutrition plan lifecycle with explicit states, transitions,
 * and immutability guarantees. This domain model ensures safe operations
 * and prepares the foundation for future sharing capabilities.
 * 
 * State Flow:
 * ┌─────────┐    generate    ┌─────────┐    lock     ┌─────────┐   expire   ┌─────────┐
 * │  EMPTY  │ ─────────────► │  DRAFT  │ ──────────► │ LOCKED  │ ─────────► │ EXPIRED │
 * └─────────┘                └─────────┘             └─────────┘            └─────────┘
 *       ▲                         │                       │                      │
 *       │                         │ regenerate            │                      │
 *       │                         ▼                       │                      │
 *       │                    ┌─────────┐                  │    new version       │
 *       │                    │  DRAFT  │ ◄────────────────┴──────────────────────┘
 *       │                    └─────────┘
 *       │                         │
 *       └─────────────────────────┘ (discard)
 */

import { LOCK_DURATION_DAYS } from '@/domain/shared/constants';

// ============================================================================
// STATE DEFINITIONS
// ============================================================================

/**
 * Plan lifecycle states
 * 
 * EMPTY:   No plan exists for this client
 * DRAFT:   Plan generated in memory, not persisted, freely editable
 * LOCKED:  Plan committed to database, immutable for LOCK_DURATION_DAYS
 * EXPIRED: Lock period ended, eligible for new version creation
 */
export type PlanLifecycleState = 'EMPTY' | 'DRAFT' | 'LOCKED' | 'EXPIRED';

/**
 * Actions that can be performed on a plan
 */
export type PlanAction = 
  | 'GENERATE'      // Create a new draft plan
  | 'REGENERATE'    // Replace current draft with new generation
  | 'LOCK'          // Commit draft to database, start lock period
  | 'DISCARD'       // Abandon draft, return to empty/expired state
  | 'VIEW'          // Read-only access
  | 'PRINT'         // Generate printable output
  | 'SHARE'         // Share plan (future feature)
  | 'SWAP_MEAL'     // Request meal substitution (creates override, not mutation)
  | 'CREATE_VERSION'; // Create new version after expiry

// ============================================================================
// STATE MACHINE RULES
// ============================================================================

/**
 * Allowed transitions from each state
 */
export const ALLOWED_TRANSITIONS: Record<PlanLifecycleState, PlanLifecycleState[]> = {
  EMPTY:   ['DRAFT'],
  DRAFT:   ['LOCKED', 'EMPTY'], // Can lock or discard
  LOCKED:  ['EXPIRED'],         // Only automatic expiry (no manual unlock)
  EXPIRED: ['DRAFT'],           // Can generate new version
} as const;

/**
 * Actions permitted in each state
 */
export const PERMITTED_ACTIONS: Record<PlanLifecycleState, PlanAction[]> = {
  EMPTY:   ['GENERATE'],
  DRAFT:   ['VIEW', 'REGENERATE', 'LOCK', 'DISCARD', 'SWAP_MEAL'],
  LOCKED:  ['VIEW', 'PRINT', 'SHARE', 'SWAP_MEAL'], // SWAP creates override, not mutation
  EXPIRED: ['VIEW', 'PRINT', 'SHARE', 'GENERATE', 'CREATE_VERSION'],
} as const;

/**
 * Actions that are NEVER allowed on a locked plan
 * These would violate immutability guarantees
 */
export const FORBIDDEN_WHEN_LOCKED: PlanAction[] = [
  'REGENERATE',  // Cannot replace a locked plan
  'DISCARD',     // Cannot delete a locked plan
] as const;

// ============================================================================
// DOMAIN PRIMITIVES (for future sharing support)
// ============================================================================

/**
 * Minimum identifiers required for sharing a plan safely
 */
export interface ShareablePlanIdentifier {
  /** Unique plan version ID (immutable reference) */
  versionId: string;
  /** When the plan was locked (start of immutability period) */
  lockedAt: Date;
  /** When the lock expires (plan becomes eligible for new version) */
  lockedUntil: Date;
  /** Hash of plan payload (integrity verification) */
  payloadHash: string;
}

/**
 * Snapshot readiness check for sharing
 * A plan can only be shared if it meets these criteria
 */
export interface ShareabilityCheck {
  isShareable: boolean;
  reason: string | null;
  identifier: ShareablePlanIdentifier | null;
}

/**
 * Plan state context with all relevant metadata
 */
export interface PlanStateContext {
  state: PlanLifecycleState;
  planId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  lockedAt: Date | null;
  lockedUntil: Date | null;
  daysRemaining: number;
  payloadHash: string | null;
}

// ============================================================================
// STATE DERIVATION FUNCTIONS
// ============================================================================

/**
 * Derive the current lifecycle state from plan metadata
 */
export function derivePlanState(params: {
  hasPlan: boolean;
  isPersisted: boolean;
  lockedAt: Date | null;
}): PlanLifecycleState {
  const { hasPlan, isPersisted, lockedAt } = params;

  if (!hasPlan) {
    return 'EMPTY';
  }

  if (!isPersisted) {
    return 'DRAFT';
  }

  if (!lockedAt) {
    // Persisted but no lock timestamp - treat as expired
    return 'EXPIRED';
  }

  const lockExpiry = new Date(lockedAt);
  lockExpiry.setDate(lockExpiry.getDate() + LOCK_DURATION_DAYS);

  if (new Date() < lockExpiry) {
    return 'LOCKED';
  }

  return 'EXPIRED';
}

/**
 * Calculate lock expiry date from lock timestamp
 */
export function calculateLockExpiry(lockedAt: Date): Date {
  const expiry = new Date(lockedAt);
  expiry.setDate(expiry.getDate() + LOCK_DURATION_DAYS);
  return expiry;
}

/**
 * Calculate days remaining in lock period
 */
export function calculateDaysRemaining(lockedAt: Date): number {
  const expiry = calculateLockExpiry(lockedAt);
  const now = new Date();
  
  if (now >= expiry) {
    return 0;
  }
  
  const msRemaining = expiry.getTime() - now.getTime();
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

// ============================================================================
// TRANSITION VALIDATION
// ============================================================================

/**
 * Check if a state transition is allowed
 */
export function canTransition(from: PlanLifecycleState, to: PlanLifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Check if an action is permitted in the current state
 */
export function isActionPermitted(state: PlanLifecycleState, action: PlanAction): boolean {
  return PERMITTED_ACTIONS[state].includes(action);
}

/**
 * Check if a plan can be regenerated
 * Only allowed in DRAFT or EXPIRED states
 */
export function canRegenerate(state: PlanLifecycleState): boolean {
  return state === 'DRAFT' || state === 'EXPIRED';
}

/**
 * Check if a plan can be locked
 * Only allowed in DRAFT state
 */
export function canLock(state: PlanLifecycleState): boolean {
  return state === 'DRAFT';
}

/**
 * Check if a plan is immutable (locked or has been locked)
 */
export function isImmutable(state: PlanLifecycleState): boolean {
  return state === 'LOCKED';
}

/**
 * Check if modifications are allowed
 * Note: SWAP_MEAL creates an override record, not a mutation
 */
export function canModify(state: PlanLifecycleState): boolean {
  return state === 'DRAFT';
}

// ============================================================================
// SHAREABILITY CHECKS
// ============================================================================

/**
 * Check if a plan is ready for sharing
 * Plans must be LOCKED or EXPIRED to be shared (immutable guarantee)
 */
export function checkShareability(context: PlanStateContext): ShareabilityCheck {
  // Must have a persisted version
  if (!context.versionId) {
    return {
      isShareable: false,
      reason: 'Plan must be locked before sharing',
      identifier: null,
    };
  }

  // Must be in a shareable state
  if (context.state !== 'LOCKED' && context.state !== 'EXPIRED') {
    return {
      isShareable: false,
      reason: 'Only locked or expired plans can be shared',
      identifier: null,
    };
  }

  // Must have lock metadata
  if (!context.lockedAt || !context.lockedUntil || !context.payloadHash) {
    return {
      isShareable: false,
      reason: 'Plan is missing required metadata for sharing',
      identifier: null,
    };
  }

  return {
    isShareable: true,
    reason: null,
    identifier: {
      versionId: context.versionId,
      lockedAt: context.lockedAt,
      lockedUntil: context.lockedUntil,
      payloadHash: context.payloadHash,
    },
  };
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * Versioning rules:
 * 
 * 1. A new version is created when:
 *    - A draft is locked (creates version N+1)
 *    - An expired plan is regenerated (creates version N+1)
 * 
 * 2. Versions are NEVER mutated:
 *    - Once created, a version's payload is immutable
 *    - Meal swaps create plan_overrides records, not payload changes
 * 
 * 3. Version numbering:
 *    - Monotonically increasing per plan
 *    - Version 1 is the first locked version
 *    - Drafts do not have version numbers until locked
 */

export interface VersioningDecision {
  shouldCreateVersion: boolean;
  reason: string;
  nextVersionNumber: number | null;
}

/**
 * Determine if an action should create a new version
 */
export function shouldCreateNewVersion(
  action: PlanAction,
  state: PlanLifecycleState,
  currentVersionNumber: number | null
): VersioningDecision {
  if (action === 'LOCK' && state === 'DRAFT') {
    return {
      shouldCreateVersion: true,
      reason: 'Locking a draft creates a new immutable version',
      nextVersionNumber: (currentVersionNumber ?? 0) + 1,
    };
  }

  if (action === 'CREATE_VERSION' && state === 'EXPIRED') {
    return {
      shouldCreateVersion: true,
      reason: 'Creating version after expiry',
      nextVersionNumber: (currentVersionNumber ?? 0) + 1,
    };
  }

  return {
    shouldCreateVersion: false,
    reason: 'Action does not require versioning',
    nextVersionNumber: null,
  };
}

// ============================================================================
// IMMUTABILITY GUARANTEES
// ============================================================================

/**
 * Immutability Contract:
 * 
 * 1. LOCKED plans are read-only:
 *    - No changes to plan_payload in plan_versions table
 *    - No changes to macroTargets, weeklyPlan, or any plan data
 * 
 * 2. Modifications during lock period:
 *    - Meal swaps are stored in plan_overrides table
 *    - Overrides reference the version_id but don't modify it
 *    - Overrides track macro deltas for tolerance validation
 * 
 * 3. After lock expiry:
 *    - Original version remains unchanged
 *    - New version can be created with fresh generation
 *    - Old versions remain accessible for history
 * 
 * 4. Sharing depends on immutability:
 *    - Shared links reference version_id
 *    - payload_hash ensures integrity
 *    - Recipients see exactly what was locked
 */

/**
 * Validate that an operation doesn't violate immutability
 */
export function validateImmutability(
  state: PlanLifecycleState,
  action: PlanAction
): { valid: boolean; violation: string | null } {
  if (state === 'LOCKED' && FORBIDDEN_WHEN_LOCKED.includes(action)) {
    return {
      valid: false,
      violation: `Action '${action}' is forbidden on locked plans to preserve immutability`,
    };
  }

  return { valid: true, violation: null };
}
