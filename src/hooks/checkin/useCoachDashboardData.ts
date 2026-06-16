/**
 * useCoachDashboardData — fetches all coach clients and computes
 * per-client compliance scores, streaks, risk levels, and coach alerts.
 *
 * Returns { clients: ClientSummary[], alerts: CoachAlert[],
 *           isLoading: boolean, error: string | null }
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCoachAlerts } from '@/services/checkin/alertService';
import type { CoachAlert } from '@/types/checkin';

export interface ClientSummary {
  clientId: string;
  clientName: string;
  complianceScore: number;
  currentStreak: number;
  longestStreak: number;
  lastCheckinDate: string | null;
  adherenceTrend: 'improving' | 'stable' | 'declining';
}

export interface CoachAlertItem extends CoachAlert {
  clientName?: string;
}

export function useCoachDashboardData(trainerId: string | null) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [alerts, setAlerts] = useState<CoachAlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trainerId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Fetch all client IDs for this trainer
        const { data: clientIdRows, error: idsError } = await supabase
          .rpc('get_trainer_client_ids', { _trainer_id: trainerId });

        if (idsError) {
          throw new Error(`Failed to fetch client IDs: ${idsError.message}`);
        }

        const clientIds: string[] = (clientIdRows ?? []).map(
          (r: { client_id: string }) => r.client_id
        );

        if (clientIds.length === 0) {
          if (!cancelled) {
            setClients([]);
            setAlerts([]);
            setIsLoading(false);
          }
          return;
        }

        // 2. Fetch client names
        const { data: clientRows, error: clientError } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', clientIds);

        if (clientError) {
          throw new Error(`Failed to fetch clients: ${clientError.message}`);
        }

        const clientNameMap = new Map<string, string>();
        (clientRows ?? []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown Client';
          clientNameMap.set(c.id, name);
        });

        // 3. Fetch last 7 days of checkins for all clients
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

        const { data: checkinRows, error: checkinError } = await supabase
          .from('daily_checkins')
          .select('*')
          .in('client_id', clientIds)
          .gte('checkin_date', sinceDate)
          .order('checkin_date', { ascending: false });

        if (checkinError) {
          throw new Error(`Failed to fetch checkins: ${checkinError.message}`);
        }

        // 4. Fetch streak data
        const { data: streakRows, error: streakError } = await supabase
          .from('checkin_streaks')
          .select('*')
          .in('client_id', clientIds);

        if (streakError) {
          throw new Error(`Failed to fetch streaks: ${streakError.message}`);
        }

        const streakMap = new Map<string, { current: number; longest: number; lastDate: string | null }>();
        (streakRows ?? []).forEach((s: { client_id: string; current_streak: number; longest_streak: number; last_checkin_date: string | null }) => {
          streakMap.set(s.client_id, {
            current: s.current_streak,
            longest: s.longest_streak,
            lastDate: s.last_checkin_date,
          });
        });

        // 5. Compute per-client summaries
        const now = new Date();
        const nowIso = now.toISOString();
        const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const computedClients: ClientSummary[] = clientIds.map(id => {
          const streak = streakMap.get(id);
          const checkins = (checkinRows ?? []).filter(
            (c: { client_id: string }) => c.client_id === id
          );

          // Compliance: avg meal_adherence over last 7 days
          let complianceScore = 0;
          if (checkins.length > 0) {
            const totalAdherence = checkins.reduce(
              (sum: number, c: { meal_adherence: number }) => sum + c.meal_adherence,
              0
            );
            complianceScore = Math.round(totalAdherence / checkins.length);
          }

          const lastCheckinDate = streak?.lastDate ?? null;

          // Adherence trend: compare first half vs second half of period
          let adherenceTrend: 'improving' | 'stable' | 'declining' = 'stable';
          if (checkins.length >= 4) {
            const sorted = [...checkins].sort(
              (a: { checkin_date: string }, b: { checkin_date: string }) =>
                a.checkin_date.localeCompare(b.checkin_date)
            );
            const mid = Math.floor(sorted.length / 2);
            const firstHalf = sorted
              .slice(0, mid)
              .reduce((sum: number, c: { meal_adherence: number }) => sum + c.meal_adherence, 0) / mid;
            const secondHalf = sorted
              .slice(mid)
              .reduce((sum: number, c: { meal_adherence: number }) => sum + c.meal_adherence, 0) / (sorted.length - mid);
            if (secondHalf - firstHalf > 5) {
              adherenceTrend = 'improving';
            } else if (firstHalf - secondHalf > 5) {
              adherenceTrend = 'declining';
            }
          }

          return {
            clientId: id,
            clientName: clientNameMap.get(id) ?? 'Unknown Client',
            complianceScore,
            currentStreak: streak?.current ?? 0,
            longestStreak: streak?.longest ?? 0,
            lastCheckinDate,
            adherenceTrend,
          };
        });

        // 6. Compute risk_level for each client: red (no checkin >48h), yellow (compliance<60%), green (ok)
        // We generate synthetic alert items matching CoachAlertItem shape
        const alertItems: CoachAlertItem[] = [];
        for (const client of computedClients) {
          if (client.lastCheckinDate) {
            const lastCheckin = new Date(client.lastCheckinDate);
            if (lastCheckin < fortyEightHoursAgo) {
              alertItems.push({
                id: `risk-red-${client.clientId}`,
                client_id: client.clientId,
                trainer_id: trainerId,
                alert_type: 'missed_checkin',
                severity: 'red',
                title: 'Missed Check-in',
                message: `${client.clientName} has not checked in for over 48 hours.`,
                metadata: null,
                read: false,
                dismissed: false,
                read_at: null,
                created_at: nowIso,
                clientName: client.clientName,
              });
            }
          } else {
            // No checkin at all — red
            alertItems.push({
              id: `risk-red-nc-${client.clientId}`,
              client_id: client.clientId,
              trainer_id: trainerId,
              alert_type: 'missed_checkin',
              severity: 'red',
              title: 'No Check-in Recorded',
              message: `${client.clientName} has never checked in.`,
              metadata: null,
              read: false,
              dismissed: false,
              read_at: null,
              created_at: nowIso,
              clientName: client.clientName,
            });
          }

          if (client.complianceScore < 60) {
            alertItems.push({
              id: `risk-yellow-${client.clientId}`,
              client_id: client.clientId,
              trainer_id: trainerId,
              alert_type: 'low_adherence',
              severity: 'yellow',
              title: 'Low Compliance',
              message: `${client.clientName} has ${client.complianceScore}% compliance over the last 7 days.`,
              metadata: null,
              read: false,
              dismissed: false,
              read_at: null,
              created_at: nowIso,
              clientName: client.clientName,
            });
          }
        }

        // 7. Fetch persisted alerts from DB
        const { alerts: dbAlerts } = await getCoachAlerts(trainerId, {
          limit: 20,
          includeRead: false,
          includeDismissed: false,
        });

        if (!cancelled) {
          setClients(computedClients);
          setAlerts([...alertItems, ...dbAlerts.map(a => ({ ...a, clientName: clientNameMap.get(a.client_id) ?? 'Unknown' }))]);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [trainerId]);

  return { clients, alerts, isLoading, error };
}