/**
 * Review Queue page (Phase 13E) — coach-level entry point into the existing
 * per-client Review workflow (Phase 13A–13D).
 *
 * Read-only: the page only builds the queue projection and navigates into the
 * existing `/clients/:clientId/review` route. No client data is fetched here
 * beyond the already-authorized AppLayout client list (RLS-constrained).
 */

import { useAppLayout } from '@/hooks/useAppLayout';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { ReviewQueue } from '@/components/review/ReviewQueue';

export default function ReviewQueuePage() {
  const { clients, isLoadingClients, clientError } = useAppLayout();
  const queue = useReviewQueue(clients);

  // While the coach's roster is still loading, keep the queue loading too (an
  // empty roster must never flash as an empty queue).
  if (isLoadingClients || clientError) {
    return (
      <ReviewQueue
        state={
          clientError
            ? { status: 'error', queue: null, error: clientError }
            : { status: 'loading', queue: null, error: null }
        }
      />
    );
  }

  return <ReviewQueue state={queue} />;
}
