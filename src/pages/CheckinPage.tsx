/**
 * CheckinPage — tab page for client check-in / follow-up.
 *
 * Shows:
 * - Daily Check-in form (mobile-first card)
 * - Weekly Review form
 * - Client Dashboard (compliance ring, streak, checkin grid, weight trend)
 */
import { useOutletContext } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DailyCheckinForm from '@/components/checkin/DailyCheckinForm';
import WeeklyReviewForm from '@/components/checkin/WeeklyReviewForm';
import ClientCheckinDashboard from '@/components/checkin/ClientCheckinDashboard';
import { useAuth } from '@/hooks/useAuth';
import type { AppLayoutContext } from '@/components/AppLayout';

export default function CheckinPage() {
  const { activeClientId, activeClient } = useOutletContext<AppLayoutContext>();
  const { userId } = useAuth();

  if (!activeClientId || !activeClient) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Select a client to view check-ins.
      </div>
    );
  }

  // Authenticated user ID for created_by field in database writes
  const currentUserId = userId ?? activeClientId;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">
        Check-in & Follow-up
      </h2>
      <p className="text-muted-foreground">
        Daily check-ins, weekly reviews, and progress tracking for {activeClient.firstName}.
      </p>

      <Tabs defaultValue="daily" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-card shadow-card">
          <TabsTrigger value="daily">Daily Check-in</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Review</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <DailyCheckinForm clientId={activeClientId} userId={currentUserId} />
        </TabsContent>

        <TabsContent value="weekly">
          <WeeklyReviewForm clientId={activeClientId} userId={currentUserId} />
        </TabsContent>

        <TabsContent value="dashboard">
          <ClientCheckinDashboard clientId={activeClientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}