/**
 * DecisionHistory — read-only historical coaching decisions (Phase 13D).
 *
 * Renders the client's PERSISTED `coaching_decisions`, newest-first. Every
 * value shown is a persisted fact mapped verbatim from the domain decision:
 *  - no edit / delete / retry-as-save / plan controls (informational only);
 *  - no implied prescription mutation: a coach decision is NOT shown as having
 *    changed the active prescription;
 *  - missing optional fields (final target / note / recommendation values) are
 *    simply not rendered — nothing is inferred or fabricated;
 *  - dates come from the persisted `decisionDate` only.
 *
 * States: loading (skeleton), empty ("No coaching decisions recorded yet."),
 * error (non-destructive alert), populated (newest-first entries).
 */

import { History, Clock, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { presentCoachAction } from './coachDecisionPresentation';
import {
  presentClientReviewStatus,
  formatKcal,
  formatDate,
  formatInteger,
} from './reviewPresentation';
import type { DecisionHistoryStatus } from '@/hooks/useCoachingDecisionHistory';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';

export interface DecisionHistoryProps {
  readonly status: DecisionHistoryStatus;
  readonly decisions: CoachingDecision[];
  readonly error: string | null;
}

export function DecisionHistory({ status, decisions, error }: DecisionHistoryProps) {
  return (
    <Card className="p-5 shadow-card" aria-busy={status === 'loading'}>
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        Decision History
      </h3>
      {status === 'loading' ? <HistoryLoading /> : null}
      {status === 'error' ? <HistoryError error={error} /> : null}
      {status === 'ready' && decisions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No coaching decisions recorded yet.
        </p>
      ) : null}
      {status === 'ready' && decisions.length > 0 ? (
        <ol className="mt-3 space-y-4">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <HistoryEntry decision={decision} />
            </li>
          ))}
        </ol>
      ) : null}
      {status === 'ready' && decisions.length > 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Historical decisions are read-only records. Recording a decision does not change the
          prescription and does not generate or activate a plan.
        </p>
      ) : null}
    </Card>
  );
}

function HistoryEntry({ decision }: { decision: CoachingDecision }) {
  const statusPresentation = presentClientReviewStatus(decision.recommendationStatus);
  const actionPresentation = presentCoachAction(decision.coachAction);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            {formatDate(decision.decisionDate)}
          </span>
        </div>
        <Badge variant="outline" className={statusPresentation.className}>
          {statusPresentation.label}
        </Badge>
      </div>

      <div className="mt-3 text-sm space-y-1">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">System:</span>{' '}
          {formatSystemRecommendation(decision)}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Coach:</span> {actionPresentation.label}
          {decision.finalTargetCalories !== null
            ? ` → ${formatKcal(decision.finalTargetCalories)}`
            : null}
        </p>
        {decision.coachNote ? (
          <p className="text-muted-foreground italic">
            <span className="font-medium not-italic text-foreground">Note:</span> “
            {decision.coachNote}”
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The persisted system-recommendation snapshot, verbatim. Each value is shown
 * only when it was actually recorded; nothing is derived or defaulted.
 */
function formatSystemRecommendation(decision: CoachingDecision): string {
  const parts: string[] = [];
  if (decision.recommendedCalorieAdjustment !== null) {
    const adjustment = decision.recommendedCalorieAdjustment;
    parts.push(
      `${adjustment > 0 ? '+' : ''}${formatInteger(adjustment)} kcal/day adjustment`,
    );
  }
  if (decision.recommendedTargetCalories !== null) {
    parts.push(`→ ${formatKcal(decision.recommendedTargetCalories)}`);
  }
  if (parts.length === 0) {
    return decision.recommendationStatus === 'maintain' ? 'Maintain' : '—';
  }
  return parts.join(' ');
}

function HistoryLoading() {
  return (
    <div className="mt-3 space-y-3" aria-label="Loading decision history">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function HistoryError({ error }: { error: string | null }) {
  return (
    <Alert variant="destructive" className="mt-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-destructive">
        <strong>Unable to load the decision history.</strong>{' '}
        {error ?? 'The history could not be loaded.'}
      </AlertDescription>
    </Alert>
  );
}
