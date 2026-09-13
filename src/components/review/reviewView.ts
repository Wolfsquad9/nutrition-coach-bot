/**
 * Client Review view types (Phase 13B)
 *
 * The shape handed from the wiring hook to the read-only presentation
 * components. Contains no React and no logic — only the data contract.
 */

import type { ClientReview } from '@/domain/review/reviewModel';
import type { NutritionMetrics } from '@/types';
import type { ReviewEvidenceSummary } from '@/services/review/buildReviewState';

export type ClientReviewViewStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Read-only summary of the client's current prescription / plan state. */
export interface ReviewPrescriptionInfo {
  readonly hasActivePrescription: boolean;
  /** Existing plan lifecycle label (LOCKED/DRAFT/EMPTY/EXPIRED/ERROR/...). */
  readonly state: string;
  readonly isLocked: boolean;
  readonly daysRemaining: number | null;
  readonly versionNumber: number | null;
  readonly lockEstablishedAt: string | null;
  readonly source: 'locked_plan' | 'initial_profile' | null;
  readonly weeklyRateKg: number | null;
}

/** The complete read-only review state consumed by the presentation layer. */
export interface ClientReviewView {
  readonly status: ClientReviewViewStatus;
  readonly error: string | null;
  /** The Phase 13A review — present only when status is 'ready'. */
  readonly review: ClientReview | null;
  /** Canonical current-prescription metrics — present only when 'ready'. */
  readonly currentMetrics: NutritionMetrics | null;
  readonly prescription: ReviewPrescriptionInfo | null;
  readonly evidence: ReviewEvidenceSummary | null;
}