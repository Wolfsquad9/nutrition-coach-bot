/**
 * Client Review — presentation mapping (Phase 13B)
 *
 * Pure, framework-free mapping from the Phase 13A `ClientReviewStatus` (and
 * the decision's adherence signal) to display copy + badge styling.
 *
 * This module contains NO nutrition logic and NO decision logic: it only turns
 * the ALREADY-DETERMINED review status into consistent, accessible presentable
 * values. The authoritative classification always comes from the review model.
 */

import type { ClientReviewStatus } from '@/domain/review/reviewModel';

export type ReviewTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

/** Presentable status (the review status, plus an explicit `error` slot). */
export type ReviewDisplayStatus = ClientReviewStatus | 'error';

export interface ClientReviewStatusPresentation {
  readonly status: ReviewDisplayStatus;
  readonly label: string;
  /** Semantic tone — drives color + icon; color is never the only cue. */
  readonly tone: ReviewTone;
  /** One of the existing badge variants. */
  readonly badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  /** Existing design-system color utility classes. */
  readonly className: string;
  /** Short coach-facing explanation (UI copy, not a clinical claim). */
  readonly description: string;
}

const PRESENTATION: Record<ReviewDisplayStatus, Omit<ClientReviewStatusPresentation, 'status'>> = {
  maintain: {
    label: 'Maintain',
    tone: 'success',
    badgeVariant: 'secondary',
    className: 'bg-success/20 text-success border-success/30',
    description: 'Sufficient evidence; no prescription adjustment is needed.',
  },
  adjustment_recommended: {
    label: 'Adjustment recommended',
    tone: 'warning',
    badgeVariant: 'secondary',
    className: 'bg-warning/20 text-warning border-warning/30',
    description: 'Sufficient adherence and a meaningful trend; the engine proposes a change.',
  },
  review_required: {
    label: 'Review required',
    tone: 'danger',
    badgeVariant: 'destructive',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
    description: 'Coach attention needed before any prescription change (e.g. adherence/context).',
  },
  insufficient_data: {
    label: 'Insufficient data',
    tone: 'muted',
    badgeVariant: 'outline',
    className: 'bg-muted text-muted-foreground border-border',
    description: 'Not enough valid evidence to make an adaptation evaluation.',
  },
  error: {
    label: 'Unable to load review',
    tone: 'danger',
    badgeVariant: 'destructive',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
    description: 'The review could not be calculated. No decision is shown.',
  },
};

/** The single label used to render an actionable adjustment. */
export const ADJUSTMENT_LABEL = 'Adjustment recommended';

/** Present an authoritative review status. */
export function presentClientReviewStatus(status: ReviewDisplayStatus): ClientReviewStatusPresentation {
  const base = PRESENTATION[status];
  return { status, ...base };
}

export interface AdherencePresentation {
  readonly label: string;
  readonly tone: ReviewTone;
}

/**
 * Present the engine's adherence signal (`decision.adherent`): true ->
 * sufficient, false -> insufficient, null -> unknown. Never a new judgment.
 */
export function presentAdherence(adherent: boolean | null): AdherencePresentation {
  if (adherent === true) {
    return { label: 'Sufficient', tone: 'success' };
  }
  if (adherent === false) {
    return { label: 'Insufficient', tone: 'danger' };
  }
  return { label: 'Unknown', tone: 'muted' };
}

// ============================================================================
// Display formatting (pure, locale-friendly, no nutrition logic)
// ============================================================================

const numberFormatter = new Intl.NumberFormat('en-US');

/** 2209 -> "2,209", 2000 -> "2,000". */
export function formatInteger(value: number): string {
  return numberFormatter.format(Math.round(value));
}

/** 2209 -> "2,209 kcal/day". */
export function formatKcal(value: number): string {
  return `${formatInteger(value)} kcal/day`;
}

/** 150.4 -> "150 g". */
export function formatGrams(value: number): string {
  return `${formatInteger(value)} g`;
}

/** -0.5 -> "-0.5 kg/week". */
export function formatRate(value: number): string {
  return `${value} kg/week`;
}

/** 85 -> "85%". */
export function formatPercent(value: number): string {
  return `${formatInteger(value)}%`;
}

/** 2026-01-05 -> "2026-01-05" (already ISO date). */
export function formatDate(iso: string | null): string {
  return iso ?? '—';
}