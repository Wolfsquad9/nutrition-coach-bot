/**
 * ClientAlertsPage — client-facing alert feed.
 *
 * Shows alerts for the authenticated client by reusing the existing
 * getClientAlerts service and coach_alerts table. RLS ensures clients
 * can only see their own alerts.
 *
 * No backend changes, no new services.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Info, CheckCircle, Eye, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getClientAlerts, markAlertRead } from '@/services/checkin/alertService';
import type { CoachAlert } from '@/types/checkin';

const severityConfig = {
  red: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30' },
  yellow: { icon: Info, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  green: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
} as const;

export default function ClientAlertsPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [alerts, setAlerts] = useState<CoachAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    if (!clientId) return;
    const result = await getClientAlerts(clientId, { limit: 20, includeRead: true });
    setAlerts(result.alerts);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !clientId) {
      setLoading(false);
      return;
    }
    fetchAlerts();
  }, [clientId, isAuthenticated, isAuthLoading, fetchAlerts]);

  const handleMarkRead = async (alertId: string) => {
    await markAlertRead(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true, read_at: new Date().toISOString() } : a));
  };

  if (isAuthLoading || loading) {
    return (
      <Card className="p-12 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading alerts...</p>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated || !clientId) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold text-primary">Alerts</h2>
          <p className="text-muted-foreground">Please sign in to view your alerts.</p>
        </div>
      </Card>
    );
  }

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-primary">Alerts</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount} unread</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAlerts}>
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {alerts.map(alert => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;

          return (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border transition-all ${config.bg} ${config.border} ${alert.read ? 'opacity-70' : 'opacity-100'}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-medium text-sm truncate ${alert.read ? 'text-foreground' : 'text-foreground font-bold'}`}>
                      {alert.title}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {alert.message}
                  </p>
                  {!alert.read && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleMarkRead(alert.id)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Mark read
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <Card className="p-6 shadow-card">
            <p className="text-sm text-muted-foreground text-center py-8">
              No alerts — everything looks good!
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}