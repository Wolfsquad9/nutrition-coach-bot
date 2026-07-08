/**
 * ClientCheckinPage — client-facing check-in page.
 *
 * Reuses existing DailyCheckinForm, WeeklyReviewForm, and ClientCheckinDashboard
 * components. Fetches the client's own clientId from auth context.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DailyCheckinForm from '@/components/checkin/DailyCheckinForm';
import WeeklyReviewForm from '@/components/checkin/WeeklyReviewForm';
import ClientCheckinDashboard from '@/components/checkin/ClientCheckinDashboard';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function ClientCheckinPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();

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
          <h2 className="text-xl font-bold text-primary">Check-in</h2>
          <p className="text-muted-foreground">Please sign in to check in.</p>
        </div>
      </Card>
    );
  }

  const currentUserId = userId ?? clientId;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Check-in</h2>

      <Tabs defaultValue="daily" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-card shadow-card">
          <TabsTrigger value="daily">Daily Check-in</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Review</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <DailyCheckinForm clientId={clientId} userId={currentUserId} />
        </TabsContent>

        <TabsContent value="weekly">
          <WeeklyReviewForm clientId={clientId} userId={currentUserId} />
        </TabsContent>

        <TabsContent value="dashboard">
          <ClientCheckinDashboard clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}