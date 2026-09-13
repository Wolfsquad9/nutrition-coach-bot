/**
 * Client Review — presentation mapping unit tests (Phase 13B).
 *
 * Locks down that the presentation layer labels each authoritative review
 * status distinctly and that insufficient data / error NEVER render as an
 * adjustment or maintain decision.
 */

import { describe, it, expect } from 'vitest';
import {
  presentClientReviewStatus,
  presentAdherence,
  ADJUSTMENT_LABEL,
  formatKcal,
  formatGrams,
  formatRate,
  formatPercent,
} from './reviewPresentation';
import type { ClientReviewStatus } from '@/domain/review/reviewModel';

const ALL_STATUSES: ClientReviewStatus[] = [
  'maintain',
  'adjustment_recommended',
  'review_required',
  'insufficient_data',
];

describe('presentClientReviewStatus', () => {
  it('renders each review status with a distinct label', () => {
    const labels = ALL_STATUSES.map((s) => presentClientReviewStatus(s).label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('Maintain');
    expect(labels).toContain('Adjustment recommended');
    expect(labels).toContain('Review required');
    expect(labels).toContain('Insufficient data');
  });

  it('maintain maps to the maintain label, distinct from an adjustment', () => {
    const presentation = presentClientReviewStatus('maintain');
    expect(presentation.label).toBe('Maintain');
    expect(presentation.label).not.toBe(ADJUSTMENT_LABEL);
  });

  it('insufficient_data can never present as an adjustment or maintain', () => {
    const presentation = presentClientReviewStatus('insufficient_data');
    expect(presentation.label).toBe('Insufficient data');
    expect(presentation.label).not.toBe(ADJUSTMENT_LABEL);
    expect(presentation.label).not.toBe('Maintain');
    expect(presentation.tone).toBe('muted');
  });

  it('adjustment_recommended presents as the canonical adjustment label', () => {
    const presentation = presentClientReviewStatus('adjustment_recommended');
    expect(presentation.label).toBe(ADJUSTMENT_LABEL);
    expect(presentation.tone).toBe('warning');
  });

  it('review_required presents distinctly (coach attention, not a prescription change)', () => {
    const presentation = presentClientReviewStatus('review_required');
    expect(presentation.label).toBe('Review required');
    expect(presentation.label).not.toBe(ADJUSTMENT_LABEL);
    expect(presentation.tone).toBe('danger');
  });

  it('error is its own distinct state and never looks like a decision', () => {
    const presentation = presentClientReviewStatus('error');
    expect(presentation.label).toBe('Unable to load review');
    expect(presentation.label).not.toBe('Maintain');
    expect(presentation.label).not.toBe(ADJUSTMENT_LABEL);
  });
});

describe('presentAdherence', () => {
  it('maps the engine adherence signal without new judgment', () => {
    expect(presentAdherence(true).label).toBe('Sufficient');
    expect(presentAdherence(false).label).toBe('Insufficient');
    expect(presentAdherence(null).label).toBe('Unknown');
  });
});

describe('format helpers', () => {
  it('formats numbers for display', () => {
    expect(formatKcal(2000)).toBe('2,000 kcal/day');
    expect(formatGrams(150.4)).toBe('150 g');
    expect(formatRate(-0.5)).toBe('-0.5 kg/week');
    expect(formatPercent(85)).toBe('85%');
  });
});