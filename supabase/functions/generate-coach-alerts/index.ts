/**
 * generate-coach-alerts — Edge function that evaluates client check-in data
 * against predefined rules and inserts coach_alerts when conditions are met.
 *
 * Accepts POST with { coach_id: string } or runs against all coaches.
 * Uses service_role by default to bypass RLS.
 *
 * Follows patterns from generate-fitness-plan/index.ts and send-whatsapp/index.ts
 * for CORS headers, error handling, Supabase client initialization.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Alert type to DB check constraint mapping.
 * The DB CHECK constraint (migration 20260613120000) limits alert_type to:
 * missed_checkin, low_adherence, weight_concern, mood_drop, streak_broken,
 * goal_milestone, review_needed, system.
 *
 * We map the semantic task types to these valid DB values and store
 * the original intent in metadata.
 */
const ALERT_TYPE_MAP: Record<string, string> = {
  missed_checkin: 'missed_checkin',
  low_compliance: 'low_adherence',
  low_mood: 'mood_drop',
  missed_weekly_review: 'review_needed',
  streak_milestone: 'goal_milestone',
  follow_up_sent: 'system',
};

function mapAlertType(semanticType: string): string {
  return ALERT_TYPE_MAP[semanticType] ?? 'system';
}

/**
 * Check if a duplicate alert exists (same coach_id + client_id + type within last 24h).
 */
async function hasDuplicateAlert(
  supabase: ReturnType<typeof createClient>,
  coachId: string,
  clientId: string,
  alertType: string
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('coach_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', coachId)
    .eq('client_id', clientId)
    .eq('alert_type', mapAlertType(alertType))
    .gte('created_at', twentyFourHoursAgo);

  if (error) {
    console.error('Duplicate check error:', error);
    return false; // Proceed cautiously on error
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Get ISO week start date (Monday) for a given date.
 */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the current streak value for a client from checkin_streaks.
 */
async function getClientStreak(
  supabase: ReturnType<typeof createClient>,
  clientId: string
): Promise<{ current: number; lastCheckinDate: string | null }> {
  const { data } = await supabase
    .from('checkin_streaks')
    .select('current_streak, last_checkin_date')
    .eq('client_id', clientId)
    .maybeSingle();

  return {
    current: data?.current_streak ?? 0,
    lastCheckinDate: data?.last_checkin_date ?? null,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create service-role client (bypasses RLS for inserts)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Parse request body
    let targetCoachId: string | null = null;
    try {
      const body = await req.json();
      targetCoachId = body.coach_id ?? null;
    } catch {
      // No body or invalid JSON — process all coaches
    }

    // Get list of coaches (profiles with role trainer or admin)
    let coachIds: string[] = [];
    if (targetCoachId) {
      coachIds = [targetCoachId];
    } else {
      const { data: coaches, error: coachError } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['trainer', 'admin']);

      if (coachError) {
        throw new Error(`Failed to fetch coaches: ${coachError.message}`);
      }
      coachIds = (coaches ?? []).map((p: { id: string }) => p.id);
    }

    console.log(`Processing alerts for ${coachIds.length} coach(es)...`);

    let totalAlertsGenerated = 0;

    for (const coachId of coachIds) {
      // Get all clients for this coach
      const { data: clientIdRows, error: clientError } = await supabase
        .rpc('get_trainer_client_ids', { _trainer_id: coachId });

      if (clientError) {
        console.error(`Error fetching clients for coach ${coachId}:`, clientError);
        continue;
      }

      const clientIds: string[] = (clientIdRows ?? []).map(
        (r: { client_id: string }) => r.client_id
      );

      if (clientIds.length === 0) continue;

      for (const clientId of clientIds) {
        const alertsToInsert: Array<{
          client_id: string;
          trainer_id: string;
          alert_type: string;
          severity: 'green' | 'yellow' | 'red';
          title: string;
          message: string;
          metadata: Record<string, unknown>;
        }> = [];

        // -- Rule 1: No checkin > 48h --
        const streak = await getClientStreak(supabase, clientId);
        if (streak.lastCheckinDate) {
          const lastCheckin = new Date(streak.lastCheckinDate + 'T00:00:00Z');
          const now = new Date();
          const hoursSinceCheckin = (now.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60);

          if (hoursSinceCheckin > 48) {
            const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'missed_checkin');
            if (!deduped) {
              alertsToInsert.push({
                client_id: clientId,
                trainer_id: coachId,
                alert_type: mapAlertType('missed_checkin'),
                severity: 'red',
                title: 'Missed Check-in',
                message: `Client has not checked in for ${Math.floor(hoursSinceCheckin)} hours. Last check-in: ${streak.lastCheckinDate}.`,
                metadata: { hours_since_checkin: Math.round(hoursSinceCheckin), original_type: 'missed_checkin' },
              });
            }
          }
        } else {
          // Never checked in
          const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'missed_checkin');
          if (!deduped) {
            alertsToInsert.push({
              client_id: clientId,
              trainer_id: coachId,
              alert_type: mapAlertType('missed_checkin'),
              severity: 'red',
              title: 'No Check-in Recorded',
              message: 'Client has never submitted a check-in.',
              metadata: { hours_since_checkin: null, original_type: 'missed_checkin' },
            });
          }
        }

        // -- Rule 2: Nutrition compliance avg < 3 for 3+ consecutive days --
        // meal_adherence is 0-100. "Avg < 3" likely means meal_adherence < 3 per day.
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

        const { data: recentCheckins } = await supabase
          .from('daily_checkins')
          .select('checkin_date, meal_adherence')
          .eq('client_id', clientId)
          .gte('checkin_date', sinceDate)
          .order('checkin_date', { ascending: true });

        if (recentCheckins && recentCheckins.length >= 3) {
          // Check for 3+ consecutive days with meal_adherence < 3
          let consecutiveLow = 0;
          let lowStartDate: string | null = null;
          for (const ci of recentCheckins) {
            if (ci.meal_adherence < 3) {
              if (consecutiveLow === 0) lowStartDate = ci.checkin_date;
              consecutiveLow++;
            } else {
              consecutiveLow = 0;
              lowStartDate = null;
            }
          }

          if (consecutiveLow >= 3) {
            const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'low_compliance');
            if (!deduped) {
              alertsToInsert.push({
                client_id: clientId,
                trainer_id: coachId,
                alert_type: mapAlertType('low_compliance'),
                severity: 'red',
                title: 'Low Nutrition Compliance',
                message: `Client has had meal adherence below 3 for ${consecutiveLow} consecutive days starting ${lowStartDate}.`,
                metadata: { consecutive_low_days: consecutiveLow, start_date: lowStartDate, original_type: 'low_compliance' },
              });
            }
          }
        }

        // -- Rule 3: Mood avg < 2 for 2+ consecutive days --
        if (recentCheckins && recentCheckins.length >= 2) {
          // We need mood data. Fetch checkins with mood.
          const { data: moodCheckins } = await supabase
            .from('daily_checkins')
            .select('checkin_date, mood')
            .eq('client_id', clientId)
            .gte('checkin_date', sinceDate)
            .not('mood', 'is', null)
            .order('checkin_date', { ascending: true });

          if (moodCheckins) {
            let consecutiveLowMood = 0;
            let lowMoodStartDate: string | null = null;
            for (const ci of moodCheckins) {
              if (ci.mood !== null && ci.mood < 2) {
                if (consecutiveLowMood === 0) lowMoodStartDate = ci.checkin_date;
                consecutiveLowMood++;
              } else {
                consecutiveLowMood = 0;
                lowMoodStartDate = null;
              }
            }

            if (consecutiveLowMood >= 2) {
              const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'low_mood');
              if (!deduped) {
                alertsToInsert.push({
                  client_id: clientId,
                  trainer_id: coachId,
                  alert_type: mapAlertType('low_mood'),
                  severity: 'yellow',
                  title: 'Low Mood Detected',
                  message: `Client has reported low mood (< 2) for ${consecutiveLowMood} consecutive days starting ${lowMoodStartDate}.`,
                  metadata: { consecutive_low_mood_days: consecutiveLowMood, start_date: lowMoodStartDate, original_type: 'low_mood' },
                });
              }
            }
          }
        }

        // -- Rule 4: No weekly_review this week --
        const weekStart = getWeekStart(new Date());
        const { data: thisWeekReview } = await supabase
          .from('weekly_reviews')
          .select('id')
          .eq('client_id', clientId)
          .eq('week_start_date', weekStart)
          .maybeSingle();

        if (!thisWeekReview) {
          const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'missed_weekly_review');
          if (!deduped) {
            alertsToInsert.push({
              client_id: clientId,
              trainer_id: coachId,
              alert_type: mapAlertType('missed_weekly_review'),
              severity: 'yellow',
              title: 'Weekly Review Missing',
              message: `Client has not submitted their weekly review for the week starting ${weekStart}.`,
              metadata: { week_start_date: weekStart, original_type: 'missed_weekly_review' },
            });
          }
        }

        // -- Rule 5: current_streak = 7, 14, 21, or 30 --
        const MILESTONE_STREAKS = [7, 14, 21, 30];
        if (MILESTONE_STREAKS.includes(streak.current)) {
          const deduped = await hasDuplicateAlert(supabase, coachId, clientId, 'streak_milestone');
          if (!deduped) {
            alertsToInsert.push({
              client_id: clientId,
              trainer_id: coachId,
              alert_type: mapAlertType('streak_milestone'),
              severity: 'green',
              title: `Streak Milestone: ${streak.current} Days!`,
              message: `Client has achieved a ${streak.current}-day check-in streak!`,
              metadata: { streak_days: streak.current, original_type: 'streak_milestone' },
            });
          }
        }

        // Insert all new alerts for this client
        if (alertsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('coach_alerts')
            .insert(alertsToInsert);

          if (insertError) {
            console.error(`Error inserting alerts for client ${clientId}:`, insertError);
          } else {
            totalAlertsGenerated += alertsToInsert.length;
            console.log(`Generated ${alertsToInsert.length} alert(s) for client ${clientId}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        alerts_generated: totalAlertsGenerated,
        coaches_processed: coachIds.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-coach-alerts:", error);
    return new Response(
      JSON.stringify({
        alerts_generated: 0,
        coaches_processed: 0,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});