/**
 * Plan Lifecycle State Machine Tests
 * 
 * Tests state derivation, transitions, action permissions,
 * shareability checks, and immutability guarantees.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  derivePlanState,
  calculateDaysRemaining,
  calculateLockExpiry,
  canTransition,
  isActionPermitted,
  canRegenerate,
  canLock,
  isImmutable,
  canModify,
  checkShareability,
  shouldCreateNewVersion,
  validateImmutability,
  ALLOWED_TRANSITIONS,
  PERMITTED_ACTIONS,
  FORBIDDEN_WHEN_LOCKED,
  type PlanLifecycleState,
  type PlanAction,
  type PlanStateContext,
} from './planLifecycle';
import { LOCK_DURATION_DAYS } from '@/domain/shared/constants';

describe('Plan Lifecycle State Machine', () => {
  // =========================================================================
  // STATE DERIVATION
  // =========================================================================
  
  describe('derivePlanState', () => {
    it('returns EMPTY when no plan exists', () => {
      const state = derivePlanState({
        hasPlan: false,
        isPersisted: false,
        lockedAt: null,
      });
      expect(state).toBe('EMPTY');
    });

    it('returns DRAFT when plan exists but not persisted', () => {
      const state = derivePlanState({
        hasPlan: true,
        isPersisted: false,
        lockedAt: null,
      });
      expect(state).toBe('DRAFT');
    });

    it('returns LOCKED when plan is persisted with active lock', () => {
      const lockedAt = new Date();
      const state = derivePlanState({
        hasPlan: true,
        isPersisted: true,
        lockedAt,
      });
      expect(state).toBe('LOCKED');
    });

    it('returns EXPIRED when lock period has passed', () => {
      const lockedAt = new Date();
      lockedAt.setDate(lockedAt.getDate() - (LOCK_DURATION_DAYS + 1));
      
      const state = derivePlanState({
        hasPlan: true,
        isPersisted: true,
        lockedAt,
      });
      expect(state).toBe('EXPIRED');
    });

    it('returns EXPIRED when persisted but no lockedAt timestamp', () => {
      const state = derivePlanState({
        hasPlan: true,
        isPersisted: true,
        lockedAt: null,
      });
      expect(state).toBe('EXPIRED');
    });
  });

  // =========================================================================
  // LOCK DURATION CALCULATIONS
  // =========================================================================

  describe('calculateLockExpiry', () => {
    it('calculates expiry date correctly', () => {
      const lockedAt = new Date('2024-01-01T00:00:00Z');
      const expiry = calculateLockExpiry(lockedAt);
      
      const expectedExpiry = new Date('2024-01-01T00:00:00Z');
      expectedExpiry.setDate(expectedExpiry.getDate() + LOCK_DURATION_DAYS);
      
      expect(expiry.getTime()).toBe(expectedExpiry.getTime());
    });
  });

  describe('calculateDaysRemaining', () => {
    it('returns positive days when lock is active', () => {
      const lockedAt = new Date();
      lockedAt.setDate(lockedAt.getDate() - 2); // Locked 2 days ago
      
      const remaining = calculateDaysRemaining(lockedAt);
      expect(remaining).toBe(LOCK_DURATION_DAYS - 2);
    });

    it('returns 0 when lock has expired', () => {
      const lockedAt = new Date();
      lockedAt.setDate(lockedAt.getDate() - (LOCK_DURATION_DAYS + 1));
      
      const remaining = calculateDaysRemaining(lockedAt);
      expect(remaining).toBe(0);
    });

    it('returns full duration when just locked', () => {
      const lockedAt = new Date();
      
      const remaining = calculateDaysRemaining(lockedAt);
      expect(remaining).toBe(LOCK_DURATION_DAYS);
    });
  });

  // =========================================================================
  // STATE TRANSITIONS
  // =========================================================================

  describe('canTransition', () => {
    it('allows EMPTY → DRAFT', () => {
      expect(canTransition('EMPTY', 'DRAFT')).toBe(true);
    });

    it('allows DRAFT → LOCKED', () => {
      expect(canTransition('DRAFT', 'LOCKED')).toBe(true);
    });

    it('allows DRAFT → EMPTY (discard)', () => {
      expect(canTransition('DRAFT', 'EMPTY')).toBe(true);
    });

    it('allows LOCKED → EXPIRED', () => {
      expect(canTransition('LOCKED', 'EXPIRED')).toBe(true);
    });

    it('allows EXPIRED → DRAFT', () => {
      expect(canTransition('EXPIRED', 'DRAFT')).toBe(true);
    });

    it('forbids EMPTY → LOCKED (must go through DRAFT)', () => {
      expect(canTransition('EMPTY', 'LOCKED')).toBe(false);
    });

    it('forbids LOCKED → DRAFT (must wait for expiry)', () => {
      expect(canTransition('LOCKED', 'DRAFT')).toBe(false);
    });

    it('forbids LOCKED → EMPTY (cannot delete locked plans)', () => {
      expect(canTransition('LOCKED', 'EMPTY')).toBe(false);
    });
  });

  // =========================================================================
  // ACTION PERMISSIONS
  // =========================================================================

  describe('isActionPermitted', () => {
    describe('EMPTY state', () => {
      it('allows GENERATE', () => {
        expect(isActionPermitted('EMPTY', 'GENERATE')).toBe(true);
      });

      it('forbids VIEW (no plan to view)', () => {
        expect(isActionPermitted('EMPTY', 'VIEW')).toBe(false);
      });

      it('forbids LOCK (nothing to lock)', () => {
        expect(isActionPermitted('EMPTY', 'LOCK')).toBe(false);
      });
    });

    describe('DRAFT state', () => {
      it('allows VIEW', () => {
        expect(isActionPermitted('DRAFT', 'VIEW')).toBe(true);
      });

      it('allows REGENERATE', () => {
        expect(isActionPermitted('DRAFT', 'REGENERATE')).toBe(true);
      });

      it('allows LOCK', () => {
        expect(isActionPermitted('DRAFT', 'LOCK')).toBe(true);
      });

      it('allows DISCARD', () => {
        expect(isActionPermitted('DRAFT', 'DISCARD')).toBe(true);
      });

      it('allows SWAP_MEAL', () => {
        expect(isActionPermitted('DRAFT', 'SWAP_MEAL')).toBe(true);
      });

      it('forbids PRINT (must lock first)', () => {
        expect(isActionPermitted('DRAFT', 'PRINT')).toBe(false);
      });

      it('forbids SHARE (must lock first)', () => {
        expect(isActionPermitted('DRAFT', 'SHARE')).toBe(false);
      });
    });

    describe('LOCKED state', () => {
      it('allows VIEW', () => {
        expect(isActionPermitted('LOCKED', 'VIEW')).toBe(true);
      });

      it('allows PRINT', () => {
        expect(isActionPermitted('LOCKED', 'PRINT')).toBe(true);
      });

      it('allows SHARE', () => {
        expect(isActionPermitted('LOCKED', 'SHARE')).toBe(true);
      });

      it('allows SWAP_MEAL (creates override)', () => {
        expect(isActionPermitted('LOCKED', 'SWAP_MEAL')).toBe(true);
      });

      it('forbids REGENERATE', () => {
        expect(isActionPermitted('LOCKED', 'REGENERATE')).toBe(false);
      });

      it('forbids DISCARD', () => {
        expect(isActionPermitted('LOCKED', 'DISCARD')).toBe(false);
      });

      it('forbids LOCK (already locked)', () => {
        expect(isActionPermitted('LOCKED', 'LOCK')).toBe(false);
      });
    });

    describe('EXPIRED state', () => {
      it('allows VIEW', () => {
        expect(isActionPermitted('EXPIRED', 'VIEW')).toBe(true);
      });

      it('allows PRINT', () => {
        expect(isActionPermitted('EXPIRED', 'PRINT')).toBe(true);
      });

      it('allows SHARE', () => {
        expect(isActionPermitted('EXPIRED', 'SHARE')).toBe(true);
      });

      it('allows GENERATE', () => {
        expect(isActionPermitted('EXPIRED', 'GENERATE')).toBe(true);
      });

      it('allows CREATE_VERSION', () => {
        expect(isActionPermitted('EXPIRED', 'CREATE_VERSION')).toBe(true);
      });
    });
  });

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  describe('canRegenerate', () => {
    it('returns true for DRAFT', () => {
      expect(canRegenerate('DRAFT')).toBe(true);
    });

    it('returns true for EXPIRED', () => {
      expect(canRegenerate('EXPIRED')).toBe(true);
    });

    it('returns false for EMPTY', () => {
      expect(canRegenerate('EMPTY')).toBe(false);
    });

    it('returns false for LOCKED', () => {
      expect(canRegenerate('LOCKED')).toBe(false);
    });
  });

  describe('canLock', () => {
    it('returns true only for DRAFT', () => {
      expect(canLock('DRAFT')).toBe(true);
      expect(canLock('EMPTY')).toBe(false);
      expect(canLock('LOCKED')).toBe(false);
      expect(canLock('EXPIRED')).toBe(false);
    });
  });

  describe('isImmutable', () => {
    it('returns true only for LOCKED', () => {
      expect(isImmutable('LOCKED')).toBe(true);
      expect(isImmutable('EMPTY')).toBe(false);
      expect(isImmutable('DRAFT')).toBe(false);
      expect(isImmutable('EXPIRED')).toBe(false);
    });
  });

  describe('canModify', () => {
    it('returns true only for DRAFT', () => {
      expect(canModify('DRAFT')).toBe(true);
      expect(canModify('EMPTY')).toBe(false);
      expect(canModify('LOCKED')).toBe(false);
      expect(canModify('EXPIRED')).toBe(false);
    });
  });

  // =========================================================================
  // SHAREABILITY CHECKS
  // =========================================================================

  describe('checkShareability', () => {
    const baseContext: PlanStateContext = {
      state: 'LOCKED',
      planId: 'plan-123',
      versionId: 'version-456',
      versionNumber: 1,
      lockedAt: new Date(),
      lockedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      daysRemaining: 7,
      payloadHash: 'hash-789',
    };

    it('returns shareable for LOCKED state with all metadata', () => {
      const result = checkShareability(baseContext);
      
      expect(result.isShareable).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.identifier).not.toBeNull();
      expect(result.identifier?.versionId).toBe('version-456');
      expect(result.identifier?.payloadHash).toBe('hash-789');
    });

    it('returns shareable for EXPIRED state with all metadata', () => {
      const result = checkShareability({
        ...baseContext,
        state: 'EXPIRED',
      });
      
      expect(result.isShareable).toBe(true);
    });

    it('returns not shareable for DRAFT state', () => {
      const result = checkShareability({
        ...baseContext,
        state: 'DRAFT',
        versionId: null,
        lockedAt: null,
        lockedUntil: null,
        payloadHash: null,
      });
      
      expect(result.isShareable).toBe(false);
      expect(result.reason).toContain('locked');
    });

    it('returns not shareable when versionId is missing', () => {
      const result = checkShareability({
        ...baseContext,
        versionId: null,
      });
      
      expect(result.isShareable).toBe(false);
      expect(result.reason).toContain('locked before sharing');
    });

    it('returns not shareable when payloadHash is missing', () => {
      const result = checkShareability({
        ...baseContext,
        payloadHash: null,
      });
      
      expect(result.isShareable).toBe(false);
      expect(result.reason).toContain('metadata');
    });
  });

  // =========================================================================
  // VERSIONING
  // =========================================================================

  describe('shouldCreateNewVersion', () => {
    it('creates version when locking a draft', () => {
      const result = shouldCreateNewVersion('LOCK', 'DRAFT', null);
      
      expect(result.shouldCreateVersion).toBe(true);
      expect(result.nextVersionNumber).toBe(1);
    });

    it('increments version number correctly', () => {
      const result = shouldCreateNewVersion('LOCK', 'DRAFT', 3);
      
      expect(result.shouldCreateVersion).toBe(true);
      expect(result.nextVersionNumber).toBe(4);
    });

    it('creates version when creating new version from expired', () => {
      const result = shouldCreateNewVersion('CREATE_VERSION', 'EXPIRED', 2);
      
      expect(result.shouldCreateVersion).toBe(true);
      expect(result.nextVersionNumber).toBe(3);
    });

    it('does not create version for VIEW action', () => {
      const result = shouldCreateNewVersion('VIEW', 'LOCKED', 1);
      
      expect(result.shouldCreateVersion).toBe(false);
      expect(result.nextVersionNumber).toBeNull();
    });

    it('does not create version for REGENERATE in draft', () => {
      const result = shouldCreateNewVersion('REGENERATE', 'DRAFT', null);
      
      expect(result.shouldCreateVersion).toBe(false);
    });
  });

  // =========================================================================
  // IMMUTABILITY GUARANTEES
  // =========================================================================

  describe('validateImmutability', () => {
    it('allows VIEW on LOCKED plan', () => {
      const result = validateImmutability('LOCKED', 'VIEW');
      expect(result.valid).toBe(true);
      expect(result.violation).toBeNull();
    });

    it('allows PRINT on LOCKED plan', () => {
      const result = validateImmutability('LOCKED', 'PRINT');
      expect(result.valid).toBe(true);
    });

    it('allows SHARE on LOCKED plan', () => {
      const result = validateImmutability('LOCKED', 'SHARE');
      expect(result.valid).toBe(true);
    });

    it('forbids REGENERATE on LOCKED plan', () => {
      const result = validateImmutability('LOCKED', 'REGENERATE');
      expect(result.valid).toBe(false);
      expect(result.violation).toContain('REGENERATE');
      expect(result.violation).toContain('forbidden');
    });

    it('forbids DISCARD on LOCKED plan', () => {
      const result = validateImmutability('LOCKED', 'DISCARD');
      expect(result.valid).toBe(false);
      expect(result.violation).toContain('DISCARD');
    });

    it('allows REGENERATE on DRAFT plan', () => {
      const result = validateImmutability('DRAFT', 'REGENERATE');
      expect(result.valid).toBe(true);
    });

    it('allows DISCARD on DRAFT plan', () => {
      const result = validateImmutability('DRAFT', 'DISCARD');
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // FORBIDDEN ACTIONS CONSTANT
  // =========================================================================

  describe('FORBIDDEN_WHEN_LOCKED constant', () => {
    it('includes REGENERATE', () => {
      expect(FORBIDDEN_WHEN_LOCKED).toContain('REGENERATE');
    });

    it('includes DISCARD', () => {
      expect(FORBIDDEN_WHEN_LOCKED).toContain('DISCARD');
    });

    it('does not include VIEW', () => {
      expect(FORBIDDEN_WHEN_LOCKED).not.toContain('VIEW');
    });

    it('does not include PRINT', () => {
      expect(FORBIDDEN_WHEN_LOCKED).not.toContain('PRINT');
    });

    it('does not include SHARE', () => {
      expect(FORBIDDEN_WHEN_LOCKED).not.toContain('SHARE');
    });
  });
});
