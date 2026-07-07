/**
 * ClientProgressPage — client-facing progress tracking page.
 *
 * Shows ONLY the authenticated client's own progress data.
 * Reuses the existing ProgressTracker component and progress service.
 * No new metrics, no data model changes.
 */
import { Card } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ProgressTracker } from '@/components/ProgressTracker';

export default function ClientProgressPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <Card className="p-12 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated || !clientId) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold text-primary">Progress</h2>
          <p className="text-muted-foreground">Please sign in to view your progress.</p>
        </div>
      </Card>
    );
  }

  return (
    <ProgressTracker
      clientId={clientId}
      clientName="My Progress"
    />
  );
}