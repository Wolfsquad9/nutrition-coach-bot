/**
 * DecisionSummary — read-only "System interpretation" panel.
 *
 * Renders the authoritative review status, the engine recommendation (when the
 * review recommends an adjustment), and the engine rationale. The recommended
 * adjustment and proposed target are forwarded verbatim from the adaptation
 * decision — never recomputed here.
 */

import { Shield, Check, Info, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricRow } from './MetricRow';
import {
  presentClientReviewStatus,
  formatKcal,
  formatInteger,
} from './reviewPresentation';
import type { ClientReview } from '@/domain/review/reviewModel';

export interface DecisionSummaryProps {
  review: ClientReview;
}

export function DecisionSummary({ review }: DecisionSummaryProps) {
  const presentation = presentClientReviewStatus(review.status);
  const decision = review.adaptationDecision;
  const isAdjustment = review.status === 'adjustment_recommended';

  return (
    <Card className="p-5 shadow-card border-primary/30">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Shield className="h-5 w-5 text-muted-foreground" />
        System Interpretation
      </h3>

      <div className="mt-3">
        <Badge variant="outline" className={presentation.className}>
          {presentation.label}
        </Badge>
        <p className="mt-2 text-sm text-muted-foreground">{presentation.description}</p>
        <p className="mt-2 text-sm font-medium text-foreground">{review.summary}</p>
      </div>

      {isAdjustment && review.proposedTargetCalories !== null ? (
        <div className="mt-3">
          <MetricRow
            label="Recommended adjustment"
            value={`${decision.calorieAdjustmentKcal > 0 ? '+' : ''}${formatInteger(decision.calorieAdjustmentKcal)} kcal/day`}
            icon={<Check className="h-4 w-4" />}
          />
          <MetricRow
            label="Proposed daily target"
            value={formatKcal(review.proposedTargetCalories)}
            icon={<Info className="h-4 w-4" />}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Observed trend differs from the current target while adherence is sufficient.
            This value comes from the adaptation engine — no recalculation was performed here.
          </p>
        </div>
      ) : null}

      {!isAdjustment ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No prescription adjustment is being proposed by the system.
        </p>
      ) : null}

      {decision.rationale.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Rationale
          </h4>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {decision.rationale.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}