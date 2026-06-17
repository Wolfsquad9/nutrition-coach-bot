/**
 * ClientCheckinDashboard — client-side view showing daily check-in grid,
 * streak, compliance score ring, and weight trend sparkline.
 */
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Flame, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { getCheckinHistory } from '@/services/checkin/dailyCheckinService';
import { getStreak } from '@/services/checkin/streakService';
import { getReviewHistory } from '@/services/checkin/weeklyReviewService';
import type { DailyCheckin, CheckinStreak, WeeklyReview } from '@/types/checkin';

interface Props {
  clientId: string;
}

export default function ClientCheckinDashboard({ clientId }: Props) {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [streak, setStreak] = useState<CheckinStreak | null>(null);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCheckinHistory(clientId, { limit: 30 }),
      getStreak(clientId),
      getReviewHistory(clientId, { limit: 4 }),
    ]).then(([checkinResult, streakResult, reviewResult]) => {
      setCheckins(checkinResult.checkins);
      setStreak(streakResult.streak);
      setReviews(reviewResult.reviews);
      setLoading(false);
    });
  }, [clientId]);

  if (loading) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  // Calculate compliance from last 7 checkins
  const recentCheckins = checkins.slice(0, 7);
  const avgAdherence = recentCheckins.length > 0
    ? Math.round(recentCheckins.reduce((s, c) => s + c.meal_adherence, 0) / recentCheckins.length)
    : 0;

  // Weight trend from reviews
  const weightDeltas = reviews
    .filter(r => r.bodyweight_kg !== null)
    .map(r => r.bodyweight_kg as number);
  const weightTrend = weightDeltas.length >= 2
    ? weightDeltas[0] - weightDeltas[weightDeltas.length - 1]
    : null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Compliance Ring */}
        <Card className="p-4 shadow-card text-center">
          <div className="relative w-16 h-16 mx-auto mb-2">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke={avgAdherence >= 70 ? 'hsl(142, 76%, 36%)' : avgAdherence >= 50 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)'}
                strokeWidth="6"
                strokeDasharray={`${(avgAdherence / 100) * 176} 176`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
              {avgAdherence}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">7-day Adherence</p>
        </Card>

        {/* Streak */}
        <Card className="p-4 shadow-card text-center">
          <Flame className="h-6 w-6 mx-auto mb-1 text-warning" />
          <p className="text-2xl font-bold text-primary">{streak?.current_streak ?? 0}</p>
          <p className="text-xs text-muted-foreground">Day Streak</p>
          {streak?.longest_streak && streak.longest_streak > 0 && (
            <p className="text-xs text-muted-foreground">Best: {streak.longest_streak}</p>
          )}
        </Card>

        {/* Weight Trend */}
        <Card className="p-4 shadow-card text-center">
          {weightTrend !== null ? (
            <>
              {weightTrend > 0 ? (
                <TrendingUp className="h-6 w-6 mx-auto mb-1 text-danger" />
              ) : weightTrend < 0 ? (
                <TrendingDown className="h-6 w-6 mx-auto mb-1 text-primary" />
              ) : (
                <Minus className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
              )}
              <p className="text-2xl font-bold text-primary">
                {weightTrend >= 0 ? '+' : ''}{weightTrend.toFixed(1)} kg
              </p>
              <p className="text-xs text-muted-foreground">Weight Δ (4 wk)</p>
            </>
          ) : (
            <>
              <Minus className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Insufficient data</p>
            </>
          )}
        </Card>

        {/* Checkins This Month */}
        <Card className="p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{checkins.length}</p>
          <p className="text-xs text-muted-foreground">Check-ins (30d)</p>
          {streak?.last_checkin_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Last: {new Date(streak.last_checkin_date).toLocaleDateString()}
            </p>
          )}
        </Card>
      </div>

      {/* Recent Check-in Grid */}
      <Card className="p-6 shadow-card">
        <h3 className="font-bold text-primary mb-4">Recent Check-ins</h3>
        <div className="space-y-2">
          {checkins.slice(0, 14).map(checkin => (
            <div
              key={checkin.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant={checkin.meal_adherence >= 70 ? 'default' : checkin.meal_adherence >= 50 ? 'secondary' : 'destructive'}
                >
                  {checkin.meal_adherence}%
                </Badge>
                <div>
                  <p className="text-sm font-medium">
                    {new Date(checkin.checkin_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Energy: {checkin.energy_level ?? '—'}/10
                    {checkin.workout_completed && ' • Workout done'}
                  </p>
                </div>
              </div>
              {checkin.current_weight_kg && (
                <span className="text-sm text-muted-foreground">
                  {checkin.current_weight_kg} kg
                </span>
              )}
            </div>
          ))}
          {checkins.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No check-ins yet. Start your first daily check-in above!
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
