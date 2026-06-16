/**
 * ClientDetailView — comprehensive per-client view for coaches.
 * Shows full checkin history, metric trend charts, weekly review history,
 * AI summary section with mock data placeholder, and coach notes input.
 */
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingDown, TrendingUp, Minus, Brain } from 'lucide-react';
import { getCheckinHistory } from '@/services/checkin/dailyCheckinService';
import { getReviewHistory, updateCoachNotes } from '@/services/checkin/weeklyReviewService';
import { getStreak } from '@/services/checkin/streakService';
import { generateWeeklySummary } from '@/services/checkin/coachingIntelligenceService';
import { useToast } from '@/hooks/use-toast';
import type { DailyCheckin, WeeklyReview, CheckinStreak, CoachingSummary } from '@/types/checkin';

interface Props {
  clientId: string;
}

export default function ClientDetailView({ clientId }: Props) {
  const { toast } = useToast();

  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [streak, setStreak] = useState<CheckinStreak | null>(null);
  const [aiSummary, setAiSummary] = useState<CoachingSummary | null>(null);
  const [coachNotes, setCoachNotes] = useState('');
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCheckinHistory(clientId, { limit: 30 }),
      getReviewHistory(clientId, { limit: 8 }),
      getStreak(clientId),
    ]).then(([checkinResult, reviewResult, streakResult]) => {
      setCheckins(checkinResult.checkins);
      setReviews(reviewResult.reviews);
      setStreak(streakResult.streak);

      // Pre-fill coach notes from latest review
      const latest = reviewResult.reviews[0];
      if (latest) {
        setCoachNotes(latest.coach_notes ?? '');
        setActiveReviewId(latest.id);
      }

      setLoading(false);
    });
  }, [clientId]);

  const handleGenerateAiSummary = async () => {
    setLoadingAi(true);
    const result = await generateWeeklySummary(clientId, new Date().toISOString().slice(0, 10));
    if (result.summary) {
      setAiSummary(result.summary);
    }
    setLoadingAi(false);
  };

  const handleSaveCoachNotes = async () => {
    if (!activeReviewId) return;
    setSavingNotes(true);
    const result = await updateCoachNotes(activeReviewId, coachNotes);
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Coach notes saved', description: 'Your notes have been updated.' });
    }
    setSavingNotes(false);
  };

  if (loading) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  // Latest review data for trend display
  const latestReview = reviews[0];

  return (
    <div className="space-y-6">
      {/* Streak + Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3 shadow-card text-center">
          <p className="text-lg font-bold text-primary">{streak?.current_streak ?? 0}</p>
          <p className="text-xs text-muted-foreground">Current Streak</p>
        </Card>
        <Card className="p-3 shadow-card text-center">
          <p className="text-lg font-bold text-primary">{streak?.longest_streak ?? 0}</p>
          <p className="text-xs text-muted-foreground">Longest Streak</p>
        </Card>
        <Card className="p-3 shadow-card text-center">
          <p className="text-lg font-bold text-primary">{checkins.length}</p>
          <p className="text-xs text-muted-foreground">Check-ins (30d)</p>
        </Card>
        <Card className="p-3 shadow-card text-center">
          <p className="text-lg font-bold text-primary">{reviews.length}</p>
          <p className="text-xs text-muted-foreground">Weekly Reviews</p>
        </Card>
      </div>

      {/* AI Summary Section */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-primary">AI Coaching Summary</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateAiSummary}
            disabled={loadingAi}
          >
            {loadingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Summary'}
          </Button>
        </div>

        {aiSummary ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-primary">
                {aiSummary.adherence_score !== null ? `${aiSummary.adherence_score}%` : '—'}
              </span>
              {aiSummary.trajectory === 'improving' && <TrendingUp className="h-5 w-5 text-green-500" />}
              {aiSummary.trajectory === 'declining' && <TrendingDown className="h-5 w-5 text-red-500" />}
              {aiSummary.trajectory === 'stable' && <Minus className="h-5 w-5 text-muted-foreground" />}
              <Badge variant={aiSummary.trajectory === 'improving' ? 'default' : aiSummary.trajectory === 'declining' ? 'destructive' : 'secondary'}>
                {aiSummary.trajectory}
              </Badge>
            </div>

            {aiSummary.highlights.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-green-600 mb-1">Highlights</p>
                <ul className="list-disc list-inside space-y-1">
                  {aiSummary.highlights.map((h, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.recommendations.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-600 mb-1">Recommendations</p>
                <ul className="list-disc list-inside space-y-1">
                  {aiSummary.recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.risk_flags.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-red-600 mb-1">Risk Flags</p>
                <ul className="list-disc list-inside space-y-1">
                  {aiSummary.risk_flags.map((f, i) => (
                    <li key={i} className="text-sm text-red-500">{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click "Generate Summary" to create an AI-powered coaching summary based on recent check-in data.
          </p>
        )}
      </Card>

      {/* Weekly Review History */}
      <Card className="p-6 shadow-card">
        <h3 className="text-lg font-bold text-primary mb-4">Weekly Review History</h3>
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review.id} className="p-3 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">
                  Week of {new Date(review.week_start_date).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2">
                  {review.adherence_score !== null && (
                    <Badge variant={review.adherence_score >= 70 ? 'default' : 'secondary'}>
                      {review.adherence_score}%
                    </Badge>
                  )}
                  {review.bodyweight_kg && (
                    <span className="text-xs text-muted-foreground">{review.bodyweight_kg} kg</span>
                  )}
                </div>
              </div>
              {review.wins && <p className="text-xs text-green-600">🏆 {review.wins}</p>}
              {review.challenges && <p className="text-xs text-muted-foreground mt-1">⚠️ {review.challenges}</p>}
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No weekly reviews yet.</p>
          )}
        </div>
      </Card>

      {/* Recent Check-in History */}
      <Card className="p-6 shadow-card">
        <h3 className="text-lg font-bold text-primary mb-4">Recent Check-ins</h3>
        <div className="space-y-2">
          {checkins.slice(0, 14).map(checkin => (
            <div key={checkin.id} className="flex items-center justify-between p-2 rounded border border-border text-sm">
              <div className="flex items-center gap-3">
                <Badge
                  variant={checkin.meal_adherence >= 70 ? 'default' : checkin.meal_adherence >= 50 ? 'secondary' : 'destructive'}
                  className="w-12"
                >
                  {checkin.meal_adherence}%
                </Badge>
                <span>
                  {new Date(checkin.checkin_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {checkin.workout_completed && <span className="text-green-500">✓</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>E:{checkin.energy_level ?? '—'}</span>
                <span>M:{checkin.mood ?? '—'}</span>
                <span>S:{checkin.sleep_hours ?? '—'}h</span>
              </div>
            </div>
          ))}
          {checkins.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No check-ins yet.</p>
          )}
        </div>
      </Card>

      {/* Coach Notes */}
      <Card className="p-6 shadow-card">
        <h3 className="text-lg font-bold text-primary mb-4">Coach Notes</h3>
        <Textarea
          value={coachNotes}
          onChange={(e) => setCoachNotes(e.target.value)}
          placeholder="Add private notes about this client's progress, concerns, or action items..."
          rows={4}
          className="mb-3"
        />
        <Button
          onClick={handleSaveCoachNotes}
          disabled={savingNotes || !activeReviewId}
        >
          {savingNotes ? 'Saving...' : 'Save Notes'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Notes are saved to the latest weekly review and visible to coaches only.
        </p>
      </Card>
    </div>
  );
}