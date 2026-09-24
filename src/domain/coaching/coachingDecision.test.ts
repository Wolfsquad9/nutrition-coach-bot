/**
 * Coaching Decision domain — unit tests (Phase 13C)
 *
 * Locks down validation of what a coach records:
 *  - only legal action/status combinations persist;
 *  - accepted/modified require (and accept) a final target;
 *  - maintained/deferred never carry a final target;
 *  - a modified target is checked through the CANONICAL engine feasibility
 *    mechanism (never a duplicate calorie-bound algorithm);
 *  - the system recommendation is preserved separately from the coach's choice.
 */

import { describe, it, expect } from 'vitest';
import {
  ALLOWED_ACTIONS_BY_STATUS,
  validateCoachingDecisionInput,
  type ValidationContext,
  type CoachingDecisionInput,
  type CoachAction,
} from './coachingDecision';
import { reconcileTarget, resolveProteinPriority } from '@/domain/nutrition/engine';
import type { ClientReviewStatus } from '@/domain/review/reviewModel';

const CLIENT_ID = 'client-13c';
const DATE = '2026-09-15';
const WEIGHT_KG = 80;

/** Default validation context: a non-priority client ('maintenance' goal,
 *  'moderately_active' training) — resolves to the engine's 'normal' protein
 *  priority, which is what the validator used before priority-awareness. */
function defaultContext(): ValidationContext {
  return {
    weightKg: WEIGHT_KG,
    primaryGoal: 'maintenance',
    activityLevel: 'moderately_active',
  };
}

function baseInput(
  overrides: Partial<CoachingDecisionInput> = {},
): CoachingDecisionInput {
  return {
    clientId: CLIENT_ID,
    recommendationStatus: 'adjustment_recommended',
    coachAction: 'accepted',
    baselinePrescriptionVersionId: 'ver-1',
    observedWeeklyRateKg: -0.5,
    targetWeeklyRateKg: -0.5,
    adherenceScore: 90,
    recommendedCalorieAdjustment: -150,
    recommendedTargetCalories: 2000,
    finalTargetCalories: 2000,
    coachNote: null,
    decisionDate: DATE,
    ...overrides,
  };
}

describe('validateCoachingDecisionInput — actions & status', () => {
  it('accepts a valid accepted decision for an adjustment', () => {
    const result = validateCoachingDecisionInput(baseInput(), defaultContext());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid modified decision', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: 2050 }),
      defaultContext(),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a maintained decision carrying no final target', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ recommendationStatus: 'maintain', coachAction: 'maintained', finalTargetCalories: null }),
      defaultContext(),
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a deferred decision', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ recommendationStatus: 'insufficient_data', coachAction: 'deferred', finalTargetCalories: null }),
      defaultContext(),
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown coach action', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'bogus' as CoachAction }),
      {
        weightKg: WEIGHT_KG,
        primaryGoal: 'maintenance',
        activityLevel: 'moderately_active',
      },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown coach action');
  });

  it('rejects an unknown recommendation status', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ recommendationStatus: 'nonsense' as ClientReviewStatus }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown recommendation status');
  });

  it('rejects accepted/modified for a non-adjustment status', () => {
    // accepted is not a legal action when the system did not recommend an adjustment.
    const result = validateCoachingDecisionInput(
      baseInput({ recommendationStatus: 'maintain', coachAction: 'accepted', finalTargetCalories: 2000 }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('not valid for status');
  });
});

describe('validateCoachingDecisionInput — final target rules', () => {
  it('requires a final target for accepted', () => {
    const result = validateCoachingDecisionInput(baseInput({ finalTargetCalories: null }), {
      weightKg: WEIGHT_KG,
        primaryGoal: 'maintenance',
        activityLevel: 'moderately_active',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('finalTargetCalories is required');
  });

  it('requires a final target for modified', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: null }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('finalTargetCalories is required');
  });

  it('rejects a final target on maintained', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ recommendationStatus: 'maintain', coachAction: 'maintained', finalTargetCalories: 2050 }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('finalTargetCalories must be null');
  });

  it('rejects a final target on deferred', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'deferred', finalTargetCalories: 2050 }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects a non-positive final target', () => {
    const result = validateCoachingDecisionInput(baseInput({ finalTargetCalories: 0 }), {
      weightKg: WEIGHT_KG,
        primaryGoal: 'maintenance',
        activityLevel: 'moderately_active',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('finalTargetCalories must be positive');
  });
});

describe('validateCoachingDecisionInput — canonical feasibility reuse', () => {
  it('rejects a modified target that cannot cover the protein+fat floor', () => {
    // 700 kcal cannot cover an 80kg client's protein + fat floor; the canonical
    // reconcileTarget marks it infeasible. No new bound algorithm is used.
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: 700 }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('not feasible');
  });

  it('accepts a modified target that the canonical engine reconciles as feasible', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: 2000 }),
      defaultContext(),
    );
    expect(result.valid).toBe(true);
  });
});

/**
 * Protein-priority parity (regression): a modified target must be validated
 * against the client's ACTUAL nutrition priority — derived by the canonical
 * engine (`resolveProteinPriority`), never hardcoded to 'normal'.
 *
 * Concrete 80kg math: 'normal' protein floor = 128 g (512 kcal) + fat floor
 * 48 g (432 kcal) = 944 kcal; 'priority' protein floor = 160 g (640 kcal) +
 * 432 kcal = 1072 kcal. A 1000 kcal target is therefore feasible for a
 * 'normal' client and INFEASIBLE for a priority client — the two priorities
 * must not validate identically.
 */
describe('validateCoachingDecisionInput — protein priority (regression)', () => {
  const TARGET = 1000;

  it('keeps normal-priority behavior unchanged (maintenance / moderately active)', () => {
    expect(resolveProteinPriority('maintenance', 'moderately_active')).toBe('normal');
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: TARGET }),
      defaultContext(),
    );
    // Canonical parity: same verdict as the engine for the same inputs.
    expect(result.valid).toBe(
      reconcileTarget(TARGET, WEIGHT_KG, 'normal').isFeasible,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects an infeasible target for a fat-loss (priority) client', () => {
    expect(resolveProteinPriority('fat_loss', 'moderately_active')).toBe('priority');
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: TARGET }),
      { weightKg: WEIGHT_KG, primaryGoal: 'fat_loss', activityLevel: 'moderately_active' },
    );
    // Canonical parity for the same inputs.
    expect(result.valid).toBe(
      reconcileTarget(TARGET, WEIGHT_KG, 'priority').isFeasible,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('not feasible');
  });

  it('rejects an infeasible target for a very-active (priority) client', () => {
    expect(resolveProteinPriority('maintenance', 'very_active')).toBe('priority');
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: TARGET }),
      { weightKg: WEIGHT_KG, primaryGoal: 'maintenance', activityLevel: 'very_active' },
    );
    expect(result.valid).toBe(
      reconcileTarget(TARGET, WEIGHT_KG, 'priority').isFeasible,
    );
    expect(result.valid).toBe(false);
  });

  it('still accepts a target that covers the higher priority protein floor', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachAction: 'modified', finalTargetCalories: 1200 }),
      { weightKg: WEIGHT_KG, primaryGoal: 'fat_loss', activityLevel: 'moderately_active' },
    );
    expect(result.valid).toBe(
      reconcileTarget(1200, WEIGHT_KG, 'priority').isFeasible,
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateCoachingDecisionInput — misc', () => {
  it('requires a clientId', () => {
    const result = validateCoachingDecisionInput(baseInput({ clientId: '' }), {
      weightKg: WEIGHT_KG,
        primaryGoal: 'maintenance',
        activityLevel: 'moderately_active',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('clientId is required');
  });

  it('validates the decision date format', () => {
    const result = validateCoachingDecisionInput(baseInput({ decisionDate: 'not-a-date' }), {
      weightKg: WEIGHT_KG,
        primaryGoal: 'maintenance',
        activityLevel: 'moderately_active',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('decisionDate');
  });

  it('rejects an over-long coach note', () => {
    const result = validateCoachingDecisionInput(
      baseInput({ coachNote: 'x'.repeat(2001) }),
      defaultContext(),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('coachNote');
  });
});

describe('ALLOWED_ACTIONS_BY_STATUS', () => {
  it('never allows an adjustment action outside an adjustment_recommended status', () => {
    expect(ALLOWED_ACTIONS_BY_STATUS['maintain']).not.toContain('accepted');
    expect(ALLOWED_ACTIONS_BY_STATUS['maintain']).not.toContain('modified');
    expect(ALLOWED_ACTIONS_BY_STATUS['review_required']).not.toContain('accepted');
    expect(ALLOWED_ACTIONS_BY_STATUS['insufficient_data']).not.toContain('modified');
  });

  it('preserves the distinction between recommendation and decision', () => {
    const input = baseInput({ coachAction: 'modified', finalTargetCalories: 2050 });
    // The system recommendation is stored untouched on the same record.
    expect(input.recommendedTargetCalories).toBe(2000);
    // The coach's modified target is stored independently.
    expect(input.finalTargetCalories).toBe(2050);
    expect(input.finalTargetCalories).not.toBe(input.recommendedTargetCalories);
  });
});