/**
 * Client Review page — read-only coaching review (Phase 13B).
 *
 * Establishes the selected client context (existing AppLayout pattern), builds
 * the deterministic review, and renders the read-only review view.
 */

import { useAppLayout } from '@/hooks/useAppLayout';
import { useClientReview } from '@/hooks/useClientReview';
import { useCoachingDecision } from '@/hooks/useCoachingDecision';
import { NoClientGuard } from '@/components/NoClientGuard';
import { ClientReviewView } from '@/components/review/ClientReviewView';

export default function ClientReviewPage() {
  const { activeClientId, activeClient } = useAppLayout();

  const hasClient = activeClientId !== null && activeClient !== null;
  // Hook is called unconditionally (accepts a nullable client) to satisfy the
  // React rules for consistent hook ordering across renders.
  const view = useClientReview(hasClient ? activeClient : null);
  const recording = useCoachingDecision();

  if (!hasClient) {
    return <NoClientGuard message="Select or create a client to view their nutrition review." />;
  }

  return (
    <ClientReviewView
      client={activeClient!}
      view={view}
      recording={recording}
      onRecord={recording.recordDecision}
    />
  );
}