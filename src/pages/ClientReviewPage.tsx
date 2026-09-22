/**
 * Client Review page — read-only coaching review (Phase 13B/13C) with the
 * Phase 13F workflow-completion wiring.
 *
 * The current decision state is hydrated FROM PERSISTENCE
 * (`useCurrentCoachingDecision`): after navigation or a hard refresh the page
 * reconstructs "decision recorded" from the database, never from local UI
 * memory. A successful save reconciles the local state and refreshes the
 * persisted Decision History via its normal read path; a failed save leaves
 * the decision outstanding. No prescription/plan mutation exists here.
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useClientReview } from '@/hooks/useClientReview';
import { useCoachingDecision } from '@/hooks/useCoachingDecision';
import { useCurrentCoachingDecision } from '@/hooks/useCurrentCoachingDecision';
import { useCoachingDecisionHistory } from '@/hooks/useCoachingDecisionHistory';
import { NoClientGuard } from '@/components/NoClientGuard';
import { ClientReviewView } from '@/components/review/ClientReviewView';

export default function ClientReviewPage() {
  const { activeClientId, activeClient } = useAppLayout();

  const hasClient = activeClientId !== null && activeClient !== null;
  // Hook is called unconditionally (accepts a nullable client) to satisfy the
  // React rules for consistent hook ordering across renders.
  const view = useClientReview(hasClient ? activeClient : null);
  const recording = useCoachingDecision();

  // Phase 13F: the persisted decision for the CURRENT decision date is the
  // source of truth for "recorded". The in-hook recording (only set after a
  // successful save) takes precedence; persistence hydrates refresh/navigation.
  const current = useCurrentCoachingDecision(hasClient ? activeClientId : null, {
    refreshKey: recording.recorded?.id ?? null,
  });
  const recorded = recording.recorded ?? current.currentDecision;

  // Phase 13F: after a successful save the Decision History re-reads the
  // authoritative persisted data through its existing read-only path.
  const history = useCoachingDecisionHistory(hasClient ? activeClientId : null, {
    refreshKey: recording.recorded?.id ?? null,
  });

  if (!hasClient) {
    return <NoClientGuard message="Select or create a client to view their nutrition review." />;
  }

  return (
    <div className="space-y-4">
      <Link
        to="/review"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to review queue
      </Link>
      <ClientReviewView
        client={activeClient!}
        view={view}
        recording={{ ...recording, recorded, persistedRecorded: current.currentDecision }}
        onRecord={recording.recordDecision}
        history={history}
        isCheckingRecorded={current.isLoading}
      />
    </div>
  );
}