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
import {
  computeAdherenceMetrics,
  adherenceWindowEndingOn,
  utcMsForDate,
  type AdherenceSource,
  type AdherenceTrendDirection,
} from '@/domain/coaching/adherenceMetrics';
import type {
  DailyCheckinLike,
  WeeklyReviewLike,
} from '@/domain/nutrition/adaptation';
import type { CoachAlert } from '@/types/checkin';

export interface ClientSummary {
  clientId: string;
  clientName: string;
  /**
   * Canonical 7-day compliance score (0-100) computed from REAL persisted
   * evidence. `null` when the client has no evidence in the window — a
   * missing value is never fabricated as 0%.
   */
  complianceScore: number | null;
  /** Which real source(s) the score was derived from. */
  complianceSource: AdherenceSource;
  /** Distinct check-in days in the window. */
  checkinDays: number;
  /** Expected days in the window. */
  expectedDays: number;
  /** checkinDays / expectedDays (0-1) or null when unknown. */
  coverage: number | null;
  currentStreak: number;
  longestStreak: number;
  lastCheckinDate: string | null;
  adherenceTrend: AdherenceTrendDirection;
}

export interface CoachAlertItem extends CoachAlert {
  clientName?: string;
}

/** Today as YYYY-MM-DD (UTC) — the anchor for every metric window. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

        // 3. Fetch check-in evidence for all clients (daily + weekly reviews).
        // The canonical window is the last 7 days (inclusive of today).
        const adherenceWindow = adherenceWindowEndingOn(todayIso(), 7);
        // One extra week of daily rows is fetched so the "daily evidence wins
        // per ISO week" precedence can be evaluated for weeks that start
        // before the window.
        const evidenceSince = new Date(
          utcMsForDate(adherenceWindow.startDate) - 7 * 86_400_000
        )
          .toISOString()
          .slice(0, 10);

        const [checkinResult, reviewResult] = await Promise.all([
          supabase
            .from('daily_checkins')
            .select('*')
            .in('client_id', clientIds)
            .gte('checkin_date', evidenceSince)
            .order('checkin_date', { ascending: false }),
          supabase
            .from('weekly_reviews')
            .select('*')
            .in('client_id', clientIds)
            .gte('week_start_date', evidenceSince)
            .order('week_start_date', { ascending: false }),
        ]);

        if (checkinResult.error) {
          throw new Error(`Failed to fetch checkins: ${checkinResult.error.message}`);
        }
        if (reviewResult.error) {
          throw new Error(`Failed to fetch weekly reviews: ${reviewResult.error.message}`);
        }

        const checkinRows = (checkinResult.data ?? []) as unknown as Array<
          DailyCheckinLike & { client_id: string }
        >;
        const reviewRows = (reviewResult.data ?? []) as unknown as Array<
          WeeklyReviewLike & { client_id: string }
        >;

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
          const clientCheckins = checkinRows.filter((c) => c.client_id === id);
          const clientReviews = reviewRows.filter((r) => r.client_id === id);

          // Canonical compliance/adherence metrics from REAL persisted
          // evidence (daily check-ins + weekly reviews). Identical
          // computation to the client-facing dashboard.
          const metrics = computeAdherenceMetrics({
            dailyCheckins: clientCheckins,
            weeklyReviews: clientReviews,
            window: adherenceWindow,
          });

          const lastCheckinDate = streak?.lastDate ?? null;

          return {
            clientId: id,
            clientName: clientNameMap.get(id) ?? 'Unknown Client',
            complianceScore: metrics.score,
            complianceSource: metrics.source,
            checkinDays: metrics.checkinDays,
            expectedDays: metrics.expectedDays,
            coverage: metrics.coverage,
            currentStreak: streak?.current ?? 0,
            longestStreak: streak?.longest ?? 0,
            lastCheckinDate,
            adherenceTrend: metrics.trend,
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

          // A missing compliance score means "no evidence yet", which is
          // itself a signal — but it is never reported as 0% compliance.
          if (client.complianceScore !== null && client.complianceScore < 60) {
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