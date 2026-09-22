/**
 * ReviewEvidence — read-only "What happened" + "Evidence" panel.
 *
 * Presents the trend, adherence, data sufficiency, and observation counts —
 * all taken from the existing adaptation decision and the review model. It
 * performs no trend or adherence calculation of its own.
 */

import { Gauge, TrendingDown, Percent, CalendarRange, Info, Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricRow } from './MetricRow';
import {
  formatRate,
  formatPercent,
  formatDate,
  presentAdherence,
} from './reviewPresentation';
import type { ClientReview } from '@/domain/review/reviewModel';
import type { ReviewEvidenceSummary } from '@/services/review/buildReviewState';

const OUTCOME_LABELS: Record<string, string> = {
  adherent_expected: 'On track, adherence sufficient',
  adherent_unexpected: 'Adherence sufficient, trend unexpected',
  non_adherent_expected: 'Low adherence, trend on target',
  non_adherent_unexpected: 'Low adherence, unexpected trend',
  insufficient_data: 'Insufficient evidence',
};

export interface ReviewEvidenceProps {
  review: ClientReview;
  evidence: ReviewEvidenceSummary | null;
}

export function ReviewEvidence({ review, evidence }: ReviewEvidenceProps) {
  const decision = review.adaptationDecision;
  const adherence = presentAdherence(decision.adherent);
  const sufficiencyLabel = decision.sufficientData ? 'Sufficient' : 'Insufficient';
  const outcomeLabel = OUTCOME_LABELS[decision.outcome] ?? decision.outcome;

  return (
    <Card className="p-5 shadow-card">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Gauge className="h-5 w-5 text-muted-foreground" />
        What Happened
      </h3>

      <div className="mt-3 space-y-1">
        <MetricRow
          label="Observed weekly rate"
          value={review.observedWeeklyRateKg !== null ? formatRate(review.observedWeeklyRateKg) : '—'}
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <MetricRow
          label="Target weekly rate"
          value={review.targetWeeklyRateKg !== null ? formatRate(review.targetWeeklyRateKg) : '—'}
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <MetricRow
          label="Adherence"
          value={
            review.adherenceScore !== null
              ? `${adherence.label} · ${formatPercent(review.adherenceScore)}`
              : adherence.label
          }
          icon={<Percent className="h-4 w-4" />}
          valueClassName={toneClass(adherence.tone)}
        />
        <MetricRow
          label="Data sufficiency"
          value={sufficiencyLabel}
          icon={<Info className="h-4 w-4" />}
        />
        <MetricRow
          label="Trend classification"
          value={outcomeLabel}
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      <h4 className="mt-4 text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Database className="h-4 w-4" />
        Evidence
      </h4>
      <div className="mt-1 space-y-1">
        <MetricRow
          label="Daily check-ins"
          value={evidence ? String(evidence.checkinCount) : '—'}
          icon={<CalendarRange className="h-4 w-4" />}
        />
        <MetricRow
          label="Weekly reviews"
          value={evidence ? String(evidence.weeklyReviewCount) : '—'}
        />
        <MetricRow
          label="Weight observations"
          value={evidence ? String(evidence.weightObservationCount) : '—'}
        />
        <MetricRow
          label="Latest check-in"
          value={evidence ? formatDate(evidence.latestCheckinDate) : '—'}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {decision.sufficientData ? (
            <Badge variant="secondary" className="bg-success/20 text-success border-success/30">
              Sufficient data
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              Insufficient data
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

function toneClass(tone: 'success' | 'warning' | 'danger' | 'muted'): string {
  switch (tone) {
    case 'success':
      return 'text-success';
    case 'warning':
      return 'text-warning';
    case 'danger':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}