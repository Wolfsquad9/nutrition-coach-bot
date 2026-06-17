/**
 * CoachCheckinDashboard — coach-level overview showing alert feed,
 * client compliance roster, and aggregate data.
 */
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import CoachAlertFeed from '@/components/checkin/CoachAlertFeed';
import ClientComplianceCard from '@/components/checkin/ClientComplianceCard';
import { useCoachDashboardData, type ClientSummary } from '@/hooks/checkin/useCoachDashboardData';

interface Props {
  trainerId: string;
  onNavigateToClient?: (clientId: string) => void;
}

export default function CoachCheckinDashboard({ trainerId, onNavigateToClient }: Props) {
  const { clients, alerts, isLoading, error } = useCoachDashboardData(trainerId);

  if (error) {
    return (
      <Card className="p-6 shadow-card">
        <p className="text-danger text-center">Failed to load dashboard: {error}</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  const alertCount = alerts.filter(a => !a.read).length;
  const avgCompliance = clients.length > 0
    ? Math.round(clients.reduce((s, c) => s + c.complianceScore, 0) / clients.length)
    : 0;

  const atRiskCount = clients.filter(c => c.complianceScore < 50).length;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Coach Dashboard</h2>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{clients.length}</p>
          <p className="text-xs text-muted-foreground">Total Clients</p>
        </Card>
        <Card className="p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{avgCompliance}%</p>
          <p className="text-xs text-muted-foreground">Avg Compliance</p>
        </Card>
        <Card className="p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-danger">{atRiskCount}</p>
          <p className="text-xs text-muted-foreground">At Risk</p>
        </Card>
        <Card className="p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{alertCount}</p>
          <p className="text-xs text-muted-foreground">Unread Alerts</p>
        </Card>
      </div>

      {/* Main Grid: Alert Feed + Client Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alert Feed */}
        <CoachAlertFeed
          trainerId={trainerId}
          onNavigateToClient={onNavigateToClient}
        />

        {/* Client Roster */}
        <Card className="p-6 shadow-card">
          <h3 className="text-lg font-bold text-primary mb-4">Client Compliance</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {clients.map(client => (
              <ClientComplianceCard
                key={client.clientId}
                {...client}
                onClick={onNavigateToClient ? () => onNavigateToClient(client.clientId) : undefined}
              />
            ))}
            {clients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No clients yet. Add a client to get started.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
