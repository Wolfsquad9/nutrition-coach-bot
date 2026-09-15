/**
 * ClientReviewView — read-only Client Review composition.
 *
 * Branches on the view status:
 *  - loading  -> skeletons (never misleading zeroes)
 *  - error    -> explicit error (a failure NEVER renders as a valid decision)
 *  - idle     -> nothing to load (no client)
 *  - ready    -> the full read-only review
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewStatus } from './ReviewStatus';
import { CurrentPrescription } from './CurrentPrescription';
import { ReviewEvidence } from './ReviewEvidence';
import { DecisionSummary } from './DecisionSummary';
import {
  CoachDecisionPanel,
  type CoachingDecisionRecordProps,
} from './CoachDecisionPanel';
import type { Client } from '@/types';
import type { ClientReviewView as ReviewView } from './reviewView';
import type { CreateCoachingDecisionInput } from '@/services/review/coachingDecisionService';

export interface ClientReviewViewProps {
  client: Client;
  view: ReviewView;
  /** When wired, the Coach Decision recording panel is composed into the review. */
  recording?: CoachingDecisionRecordProps;
  onRecord?: (input: CreateCoachingDecisionInput) => void;
}

export function ClientReviewView({ client, view, recording, onRecord }: ClientReviewViewProps) {
  if (view.status === 'loading' || view.status === 'idle') {
    return <LoadingState />;
  }

  if (view.status === 'error') {
    return (
      <div className="space-y-4">
        <Card className="p-5 shadow-card">
          <h2 className="text-2xl font-bold text-foreground py-2">Client Review</h2>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-destructive">
              <strong>Unable to load this review.</strong> No decision is shown —
              the review could not be calculated from the current data.
            </AlertDescription>
          </Alert>
          {view.error ? (
            <p className="mt-3 text-sm text-muted-foreground">{view.error}</p>
          ) : null}
        </Card>
      </div>
    );
  }

  const { review, currentMetrics, prescription, evidence } = view;
  if (!review) {
    // Defensive: a 'ready' view must carry a review. Never fabricate one.
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-destructive">
            Review data is unavailable. No decision is shown.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReviewStatus client={client} review={review} />
      <CurrentPrescription metrics={currentMetrics} prescription={prescription} />
      <ReviewEvidence review={review} evidence={evidence} />
      <DecisionSummary review={review} />
      {recording && onRecord ? (
        <CoachDecisionPanel
          client={client}
          review={review}
          prescription={prescription}
          recording={recording}
          onRecord={onRecord}
        />
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading client review">
      <Card className="p-5 shadow-card">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Loading client review…</h2>
        </div>
      </Card>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}