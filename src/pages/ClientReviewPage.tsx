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
import {
  scopeCoachingDecisionToClient,
  useCoachingDecision,
} from '@/hooks/useCoachingDecision';
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

  // A recording lifecycle belongs to the client it was recorded FOR. The
  // recording hook is page-scoped (not per-client), so it is explicitly scoped
  // to the ACTIVE client here: switching clients can never leak a previous
  // client's recorded/saving/error state into this client's review. This is a
  // per-render derivation, so there is no effect-ordering window in which a
  // previous client's decision could be rendered for the new client.
  const activeRecording = scopeCoachingDecisionToClient(recording, activeClientId);

  // Phase 13F: the persisted decision for the CURRENT decision date is the
  // source of truth for "recorded". The in-session recording for THIS client
  // (only set after a successful save) takes precedence; persistence hydrates
  // refresh/navigation.
  const current = useCurrentCoachingDecision(hasClient ? activeClientId : null, {
    refreshKey: activeRecording.recorded?.id ?? null,
  });
  const recorded = activeRecording.recorded ?? current.currentDecision;

  // Phase 13F: after a successful save the Decision History re-reads the
  // authoritative persisted data through its existing read-only path.
  const history = useCoachingDecisionHistory(hasClient ? activeClientId : null, {
    refreshKey: activeRecording.recorded?.id ?? null,
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
        recording={{
          isSaving: activeRecording.isSaving,
          error: activeRecording.error,
          recorded,
          persistedRecorded: current.currentDecision,
        }}
        onRecord={recording.recordDecision}
        history={history}
        isCheckingRecorded={current.isLoading}
      />
    </div>
  );
}