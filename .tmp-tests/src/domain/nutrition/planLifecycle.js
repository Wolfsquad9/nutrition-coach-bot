"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_WHEN_LOCKED = exports.PERMITTED_ACTIONS = exports.ALLOWED_TRANSITIONS = void 0;
exports.derivePlanState = derivePlanState;
exports.calculateLockExpiry = calculateLockExpiry;
exports.calculateDaysRemaining = calculateDaysRemaining;
exports.canTransition = canTransition;
exports.isActionPermitted = isActionPermitted;
exports.canRegenerate = canRegenerate;
exports.canLock = canLock;
exports.isImmutable = isImmutable;
exports.canModify = canModify;
exports.checkShareability = checkShareability;
exports.shouldCreateNewVersion = shouldCreateNewVersion;
exports.validateImmutability = validateImmutability;
const constants_1 = require("@/domain/shared/constants");
// ============================================================================
// STATE MACHINE RULES
// ============================================================================
/**
 * Allowed transitions from each state
 */
exports.ALLOWED_TRANSITIONS = {
    EMPTY: ['DRAFT'],
    DRAFT: ['LOCKED', 'EMPTY'], // Can lock or discard
    LOCKED: ['EXPIRED'], // Only automatic expiry (no manual unlock)
    EXPIRED: ['DRAFT'], // Can generate new version
};
/**
 * Actions permitted in each state
 */
exports.PERMITTED_ACTIONS = {
    EMPTY: ['GENERATE'],
    DRAFT: ['VIEW', 'REGENERATE', 'LOCK', 'DISCARD', 'SWAP_MEAL'],
    LOCKED: ['VIEW', 'PRINT', 'SHARE', 'SWAP_MEAL'], // SWAP creates override, not mutation
    EXPIRED: ['VIEW', 'PRINT', 'SHARE', 'GENERATE', 'CREATE_VERSION'],
};
/**
 * Actions that are NEVER allowed on a locked plan
 * These would violate immutability guarantees
 */
exports.FORBIDDEN_WHEN_LOCKED = [
    'REGENERATE', // Cannot replace a locked plan
    'DISCARD', // Cannot delete a locked plan
];
// ============================================================================
// STATE DERIVATION FUNCTIONS
// ============================================================================
/**
 * Derive the current lifecycle state from plan metadata
 */
function derivePlanState(params) {
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
    lockExpiry.setDate(lockExpiry.getDate() + constants_1.LOCK_DURATION_DAYS);
    if (new Date() < lockExpiry) {
        return 'LOCKED';
    }
    return 'EXPIRED';
}
/**
 * Calculate lock expiry date from lock timestamp
 */
function calculateLockExpiry(lockedAt) {
    const expiry = new Date(lockedAt);
    expiry.setDate(expiry.getDate() + constants_1.LOCK_DURATION_DAYS);
    return expiry;
}
/**
 * Calculate days remaining in lock period
 */
function calculateDaysRemaining(lockedAt) {
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
function canTransition(from, to) {
    return exports.ALLOWED_TRANSITIONS[from].includes(to);
}
/**
 * Check if an action is permitted in the current state
 */
function isActionPermitted(state, action) {
    return exports.PERMITTED_ACTIONS[state].includes(action);
}
/**
 * Check if a plan can be regenerated
 * Only allowed in DRAFT or EXPIRED states
 */
function canRegenerate(state) {
    return state === 'DRAFT' || state === 'EXPIRED';
}
/**
 * Check if a plan can be locked
 * Only allowed in DRAFT state
 */
function canLock(state) {
    return state === 'DRAFT';
}
/**
 * Check if a plan is immutable (locked or has been locked)
 */
function isImmutable(state) {
    return state === 'LOCKED';
}
/**
 * Check if modifications are allowed
 * Note: SWAP_MEAL creates an override record, not a mutation
 */
function canModify(state) {
    return state === 'DRAFT';
}
// ============================================================================
// SHAREABILITY CHECKS
// ============================================================================
/**
 * Check if a plan is ready for sharing
 * Plans must be LOCKED or EXPIRED to be shared (immutable guarantee)
 */
function checkShareability(context) {
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
/**
 * Determine if an action should create a new version
 */
function shouldCreateNewVersion(action, state, currentVersionNumber) {
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
function validateImmutability(state, action) {
    if (state === 'LOCKED' && exports.FORBIDDEN_WHEN_LOCKED.includes(action)) {
        return {
            valid: false,
            violation: `Action '${action}' is forbidden on locked plans to preserve immutability`,
        };
    }
    return { valid: true, violation: null };
}
