/**
 * Coach decision presentation — unit tests (Phase 13C)
 *
 * Verifies every supported coach action maps to stable, distinct presentable
 * copy (following the Phase 13B reviewPresentation conventions).
 */

import { describe, it, expect } from 'vitest';
import { presentCoachAction, CONFIRM_MAINTAIN_LABEL } from './coachDecisionPresentation';

describe('presentCoachAction', () => {
  it('maps every supported coach action to a distinct label', () => {
    const labels = (
      ['accepted', 'modified', 'maintained', 'deferred'] as const
    ).map((a) => presentCoachAction(a).label);
    expect(labels).toEqual([
      'Accept recommendation',
      'Modify',
      'Keep current',
      'Defer',
    ]);
  });

  it('exposes a description for every action', () => {
    for (const action of ['accepted', 'modified', 'maintained', 'deferred'] as const) {
      expect(presentCoachAction(action).description.length).toBeGreaterThan(0);
    }
  });

  it('defines a distinct confirm-maintain label', () => {
    expect(CONFIRM_MAINTAIN_LABEL).toBe('Confirm maintain');
  });
});