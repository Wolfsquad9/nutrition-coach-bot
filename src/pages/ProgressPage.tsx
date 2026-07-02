/**
 * Progress tab page — displays progress tracking for the active client
 */

import { Card } from '@/components/ui/card';
import { ProgressTracker } from '@/components/ProgressTracker';
import { useAppLayout } from '@/hooks/useAppLayout';
import { getClientLabel } from '@/utils/clientHelpers';

export default function ProgressPage() {
  const { activeClientId, activeClient } = useAppLayout();

  if (!activeClientId || !activeClient) {
    return (
      <Card className="p-6 shadow-card">
        <h2 className="text-2xl font-bold text-primary">Progress Tracking</h2>
        <p className="text-muted-foreground mt-2">Select a client first.</p>
      </Card>
    );
  }

  return (
    <ProgressTracker 
      clientId={activeClientId} 
      clientName={getClientLabel(activeClient)}
    />
  );
}
