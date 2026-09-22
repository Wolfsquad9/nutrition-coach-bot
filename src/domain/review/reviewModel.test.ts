/**
 * Client Review Model — unit tests (Phase 13A)
 *
 * Locks down the deterministic mapping from an `AdaptationDecision` to the
 * coach-facing `ClientReviewStatus`, and proves the review model:
 *  - never invents / recalculates a calorie recommendation,
 *  - preserves the engine's proposed future target verbatim,
 *  - is deterministic and immutable.
 */

import { describe, it, expect } from 'vitest';
import type {
  AdaptationDecision,
  AdaptationOutcome,
} from '@/domain/nutrition/adaptation';
import { buildClientReview } from './reviewModel';

// ============================================================================
// FIXTURES
// ============================================================================

const CLIENT_ID = 'client-13a';
const CURRENT_TARGET_CALORIES = 2209;
const ADHERENCE_SCORE = 92;

/** Deterministic full `AdaptationDecision` with overridable outcome fields. */
function decision(
  overrides: Partial<AdaptationDecision> = {},
): AdaptationDecision {
  const base: AdaptationDecision = {
    outcome: 'adherent_expected',
    sufficientData: true,
    adherent: true,
    observedWeeklyRateKg: -0.5,
    observedWeeklyRatePercentBodyweight: -0.625,
    targetWeeklyRateKg: -0.5,
    targetWeeklyRatePercentBodyweight: -0.625,
    rateToleranceKgPerWeek: 0.125,
    calorieAdjustmentKcal: 0,
    futureWeeklyRateKg: -0.5,
    effectiveFutureWeeklyRateKg: -0.5,
    futureTargetCalories: CURRENT_TARGET_CALORIES,
    lockedPlanUntouched: true,
    rationale: ['deterministic test fixture'],
  };
  return { ...base, ...overrides };
}

function buildInput(
  overrides: {
    clientId?: string;
    currentTargetCalories?: number;
    decisionOverrides?: Partial<AdaptationDecision>;
    adherenceScore?: number | null;
  } = {},
) {
  return {
    clientId: overrides.clientId ?? CLIENT_ID,
    currentTargetCalories: overrides.currentTargetCalories ?? CURRENT_TARGET_CALORIES,
    adaptationDecision: decision(overrides.decisionOverrides),
    adherenceScore: overrides.adherenceScore ?? ADHERENCE_SCORE,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('buildClientReview — status mapping', () => {
  it('maps insufficient evidence to insufficient_data with no proposed target', () => {
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'insufficient_data',
          sufficientData: false,
          observedWeeklyRateKg: null,
          futureTargetCalories: CURRENT_TARGET_CALORIES,
        },
      }),
    );

    expect(review.status).toBe('insufficient_data');
    expect(review.proposedTargetCalories).toBeNull();
    expect(review.adherenceScore).toBe(ADHERENCE_SCORE);
  });

  it('maps sufficient evidence with no adjustment to maintain', () => {
    const review = buildClientReview(
      buildInput({ decisionOverrides: { outcome: 'adherent_expected' } }),
    );

    expect(review.status).toBe('maintain');
    expect(review.proposedTargetCalories).toBeNull();
    // current target comes from the caller-provided canonical value
    expect(review.currentTargetCalories).toBe(CURRENT_TARGET_CALORIES);
  });

  it('maps an actionable adjustment to adjustment_recommended', () => {
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'adherent_unexpected',
          calorieAdjustmentKcal: -150,
          futureTargetCalories: 2059,
        },
      }),
    );

    expect(review.status).toBe('adjustment_recommended');
    expect(review.currentTargetCalories).toBe(CURRENT_TARGET_CALORIES);
  });

  it('maps insufficient adherence to review_required (unexpected trend)', () => {
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'non_adherent_unexpected',
          adherent: false,
          calorieAdjustmentKcal: 0,
          futureTargetCalories: CURRENT_TARGET_CALORIES,
        },
      }),
    );

    expect(review.status).toBe('review_required');
    // no new calorie target is invented for a poor-adherence state
    expect(review.proposedTargetCalories).toBeNull();
    expect(review.currentTargetCalories).toBe(CURRENT_TARGET_CALORIES);
  });

  it('maps insufficient adherence to review_required even when trend is expected', () => {
    // non_adherent_expected (poor adherence, line-in-trend) still needs coach
    // review — the engine carries calories forward but adherence was poor.
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'non_adherent_expected',
          adherent: false,
          calorieAdjustmentKcal: 0,
        },
      }),
    );

    expect(review.status).toBe('review_required');
    expect(review.proposedTargetCalories).toBeNull();
  });
});
describe('buildClientReview — recommendation preservation', () => {
  it('forwards the engine proposed target verbatim (no recalculation)', () => {
    const engineFutureTarget = 2000;
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'adherent_unexpected',
          calorieAdjustmentKcal: -150,
          futureTargetCalories: engineFutureTarget,
        },
      }),
    );

    expect(review.status).toBe('adjustment_recommended');
    expect(review.proposedTargetCalories).toBe(engineFutureTarget);
    expect(review.proposedTargetCalories).toBe(2000);
  });

  it('never surfaces a proposed target unless the engine adjusted', () => {
    // Even when the engine carries a (non-adjustment) futureTargetCalories
    // forward on a maintain path, the review must NOT present it as a
    // recommendation.
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'adherent_expected',
          calorieAdjustmentKcal: 0,
          futureTargetCalories: 1999,
        },
      }),
    );

    expect(review.status).toBe('maintain');
    expect(review.proposedTargetCalories).toBeNull();
  });
});
describe('buildClientReview — determinism & immutability', () => {
  it('is deterministic: identical input yields deeply equivalent output', () => {
    const input = buildInput({
      decisionOverrides: {
        outcome: 'adherent_unexpected',
        futureTargetCalories: 2059,
        calorieAdjustmentKcal: -150,
      },
    });

    const a = buildClientReview(input);
    const b = buildClientReview(input);

    expect(a).toEqual(b);
  });

  it('does not mutate the input objects or the adaptation decision', () => {
    const input = buildInput({
      decisionOverrides: {
        outcome: 'adherent_unexpected',
        futureTargetCalories: 2059,
        calorieAdjustmentKcal: -150,
      },
    });
    // Deep-freeze everything: any mutation attempt would throw in strict mode.
    const frozen = deepFreeze(input);

    const review = buildClientReview(frozen);

    expect(review.adaptationDecision).toEqual(frozen.adaptationDecision);
    expect(review.currentTargetCalories).toBe(frozen.currentTargetCalories);
    expect(review.adherenceScore).toBe(frozen.adherenceScore);
    // Build again from the same frozen input to prove nothing was consumed.
    expect(buildClientReview(frozen).status).toBe('adjustment_recommended');
  });
});
describe('buildClientReview — no hidden nutrition logic', () => {
  it('forwards observed/target rates from the engine decision rather than deriving them', () => {
    const observed = -0.84;
    const target = -0.5;
    const review = buildClientReview(
      buildInput({
        decisionOverrides: {
          outcome: 'adherent_unexpected',
          observedWeeklyRateKg: observed,
          targetWeeklyRateKg: target,
          futureTargetCalories: 2059,
        },
      }),
    );

    // observed/target rates are echoed from the decision, never recomputed.
    expect(review.observedWeeklyRateKg).toBe(observed);
    expect(review.targetWeeklyRateKg).toBe(target);
    // The proposed target comes straight from the decision, unchanged.
    expect(review.proposedTargetCalories).toBe(
      review.adaptationDecision.futureTargetCalories,
    );
  });

  it('only ever relays decision.futureTargetCalories (never an independent rule)', () => {
    const outcomes: AdaptationOutcome[] = [
      'adherent_expected',
      'adherent_unexpected',
      'non_adherent_expected',
      'non_adherent_unexpected',
      'insufficient_data',
    ];
    for (const outcome of outcomes) {
      const futureTargetCalories =
        outcome === 'adherent_unexpected' ? 2059 : CURRENT_TARGET_CALORIES;
      const review = buildClientReview(
        buildInput({
          decisionOverrides: {
            outcome,
            sufficientData: outcome !== 'insufficient_data',
            futureTargetCalories,
          },
        }),
      );

      // Whenever non-null, the proposed target is exactly the engine's value;
      // no additive/subtractive calorie rule can be present.
      expect(review.proposedTargetCalories).toBe(
        review.status === 'adjustment_recommended'
          ? review.adaptationDecision.futureTargetCalories
          : null,
      );
    }
  });
});

// ============================================================================
// HELPERS
// ============================================================================

/** Recursively freeze so any mutation throws (proves immutability). */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item));
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}