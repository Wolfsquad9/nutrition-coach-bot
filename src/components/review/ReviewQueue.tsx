/**
 * ReviewQueue — coach-level, read-only Review entry point (Phase 13E).
 *
 * Renders the deterministic queue projection (reviewQueueService) into two
 * sections: "Needs decision" (outstanding decision for the current review
 * date) and "Recently reviewed" (decision recorded for the current date).
 *
 * Strictly informational + navigational:
 *  - every entry navigates into the EXISTING per-client Review workflow
 *    (`/clients/:clientId/review` — Phase 13A–13D);
 *  - no decision-recording, editing, deletion, prescription, plan or bulk
 *    controls exist anywhere in the queue;
 *  - review status uses the existing Phase 13B presentation vocabulary
 *    (`presentClientReviewStatus`); decision wording uses the existing Phase
 *    13C coach-action presentation; no new domain terminology is invented.
 */

import { useNavigate } from 'react-router-dom';
import { ListChecks, User, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { presentClientReviewStatus, formatDate } from './reviewPresentation';
import { presentCoachAction } from './coachDecisionPresentation';
import type { ReviewQueueItem } from '@/services/review/reviewQueueService';
import type { ReviewQueueState } from '@/hooks/useReviewQueue';

export interface ReviewQueueProps {
  readonly state: ReviewQueueState;
}

export function ReviewQueue({ state }: ReviewQueueProps) {
  return (
    <div className="space-y-4" aria-busy={state.status === 'loading'}>
      <Card className="p-5 shadow-card bg-muted/30">
        <div className="flex items-center gap-3">
          <ListChecks className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Review</h2>
            <p className="text-sm text-muted-foreground">Coach review queue</p>
          </div>
        </div>
      </Card>

      {state.status === 'loading' ? <QueueLoading /> : null}
      {state.status === 'error' ? <QueueError error={state.error} /> : null}
      {state.status === 'ready' && state.queue ? (
        <QueueSections queue={state.queue} />
      ) : null}
    </div>
  );
}

function QueueSections({
  queue,
}: {
  queue: { needsDecision: ReviewQueueItem[]; resolved: ReviewQueueItem[] };
}) {
  const isEmptyRoster =
    queue.needsDecision.length === 0 && queue.resolved.length === 0;

  if (isEmptyRoster) {
    return (
      <Card className="p-5 shadow-card">
        <p className="text-sm text-muted-foreground">No clients available for review.</p>
      </Card>
    );
  }

  return (
    <>
      {queue.needsDecision.length > 0 ? (
        <QueueSection label="Needs decision" items={queue.needsDecision} />
      ) : (
        <Card className="p-5 shadow-card">
          <p className="text-sm text-muted-foreground">All clients are up to date.</p>
        </Card>
      )}
      {queue.resolved.length > 0 ? (
        <QueueSection label="Recently reviewed" items={queue.resolved} resolved />
      ) : null}
    </>
  );
}

function QueueSection({
  label,
  items,
  resolved = false,
}: {
  label: string;
  items: ReviewQueueItem[];
  resolved?: boolean;
}) {
  return (
    <section aria-label={label}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">
        {label}
      </h3>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <QueueRow key={item.clientId} item={item} resolved={resolved} />
        ))}
      </div>
    </section>
  );
}

function QueueRow({ item, resolved }: { item: ReviewQueueItem; resolved: boolean }) {
  const navigate = useNavigate();
  const statusPresentation = presentClientReviewStatus(item.reviewStatus);
  const decisionLabel = item.decisionAction
    ? presentCoachAction(item.decisionAction).label
    : 'Decision needed';

  const openReview = () => navigate(`/clients/${item.clientId}/review`);

  return (
    <button
      type="button"
      onClick={openReview}
      aria-label={`Review ${item.clientName}: ${statusPresentation.label}, ${decisionLabel}`}
      className="w-full text-left rounded-md border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">
            {item.clientName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusPresentation.className}>
            {statusPresentation.label}
          </Badge>
          <Badge
            variant="outline"
            className={
              resolved
                ? 'bg-success/20 text-success border-success/30'
                : 'bg-muted text-muted-foreground border-border'
            }
          >
            {resolved ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
                {decisionLabel}
              </>
            ) : (
              decisionLabel
            )}
          </Badge>
          {item.reviewDate ? (
            <span className="text-xs text-muted-foreground">
              Last review: {formatDate(item.reviewDate)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function QueueLoading() {
  return (
    <div aria-label="Loading review queue">
      <Card className="p-5 shadow-card">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-lg font-semibold text-foreground">Loading review queue…</p>
        </div>
      </Card>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

function QueueError({ error }: { error: string | null }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-destructive">
        <strong>Unable to load the review queue.</strong>{' '}
        {error ?? 'The queue could not be loaded.'}
      </AlertDescription>
    </Alert>
  );
}
