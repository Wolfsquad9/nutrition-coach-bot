/**
 * CoachAlertFeed — real-time alert feed for coaches.
 * Shows alerts sorted by creation date, color-coded by severity,
 * with mark-as-read and navigation.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Info, CheckCircle, Eye } from 'lucide-react';
import { getCoachAlerts, markAlertRead, dismissAlert } from '@/services/checkin/alertService';
import type { CoachAlert } from '@/types/checkin';

interface Props {
  trainerId: string;
  onNavigateToClient?: (clientId: string) => void;
}

const severityConfig = {
  red: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30' },
  yellow: { icon: Info, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  green: { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
} as const;

export default function CoachAlertFeed({ trainerId, onNavigateToClient }: Props) {
  const [alerts, setAlerts] = useState<CoachAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    const result = await getCoachAlerts(trainerId, { limit: 20 });
    setAlerts(result.alerts);
    setLoading(false);
  }, [trainerId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleMarkRead = async (alertId: string) => {
    await markAlertRead(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true, read_at: new Date().toISOString() } : a));
  };

  const handleDismiss = async (alertId: string) => {
    await dismissAlert(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (loading) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-primary">Coach Alerts</h3>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount} unread</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAlerts}>
          Refresh
        </Button>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
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
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {!alert.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleMarkRead(alert.id)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Mark read
                      </Button>
                    )}
                    {onNavigateToClient && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onNavigateToClient(alert.client_id)}
                      >
                        View client
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No alerts — everything looks good!
          </p>
        )}
      </div>
    </Card>
  );
}
