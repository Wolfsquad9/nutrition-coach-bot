/**
 * Coach decision — presentation mapping (Phase 13C)
 *
 * Pure, framework-free mapping from a `CoachAction` to display label + copy.
 * No logic, no decisions: it only turns the ALREADY-DETERMINED action into
 * consistent, accessible presentable values (matching the Phase 13B
 * reviewPresentation conventions).
 */

import type { CoachAction } from '@/domain/coaching/coachingDecision';

export interface CoachActionPresentation {
  readonly action: CoachAction;
  /** Primary button / badge label. */
  readonly label: string;
  /** Short coach-facing description. */
  readonly description: string;
}

const PRESENTATION: Record<CoachAction, Omit<CoachActionPresentation, 'action'>> = {
  accepted: {
    label: 'Accept recommendation',
    description: 'Agree with the system recommendation and record the proposed target.',
  },
  modified: {
    label: 'Modify',
    description: 'Agree with the direction but choose a different final target.',
  },
  maintained: {
    label: 'Keep current',
    description: 'Keep the current prescription as-is (no nutrition change is made).',
  },
  deferred: {
    label: 'Defer',
    description: 'Review the client again later; no nutrition change is made now.',
  },
};

/** The label used for the confirm action on a maintain recommendation. */
export const CONFIRM_MAINTAIN_LABEL = 'Confirm maintain';

/** Present an authoritative coach action. */
export function presentCoachAction(action: CoachAction): CoachActionPresentation {
  return { action, ...PRESENTATION[action] };
}