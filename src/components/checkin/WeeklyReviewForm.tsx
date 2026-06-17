/**
 * WeeklyReviewForm — weekly self-review with body measurements,
 * qualitative feedback, and optional photo uploads.
 */
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, Camera } from 'lucide-react';
import { submitWeeklyReview, getCurrentWeekReview } from '@/services/checkin/weeklyReviewService';
import { useToast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  userId: string;
}

export default function WeeklyReviewForm({ clientId, userId }: Props) {
  const { toast } = useToast();

  const [bodyweightKg, setBodyweightKg] = useState<number | null>(null);
  const [waistCm, setWaistCm] = useState<number | null>(null);
  const [hipCm, setHipCm] = useState<number | null>(null);
  const [chestCm, setChestCm] = useState<number | null>(null);
  const [adherenceScore, setAdherenceScore] = useState<number | null>(75);
  const [dietSatisfaction, setDietSatisfaction] = useState<number | null>(7);
  const [workoutConsistency, setWorkoutConsistency] = useState<number | null>(80);
  const [challenges, setChallenges] = useState('');
  const [wins, setWins] = useState('');
  const [goals, setGoals] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentWeekReview(clientId).then(result => {
      if (result.review) {
        setSubmitted(true);
        setBodyweightKg(result.review.bodyweight_kg);
        setWaistCm(result.review.waist_cm);
        setHipCm(result.review.hip_cm);
        setChestCm(result.review.chest_cm);
        setAdherenceScore(result.review.adherence_score);
        setDietSatisfaction(result.review.diet_satisfaction);
        setWorkoutConsistency(result.review.workout_consistency);
        setChallenges(result.review.challenges ?? '');
        setWins(result.review.wins ?? '');
        setGoals(result.review.goals_for_next_week ?? '');
        setPhotoUrls(result.review.photo_urls ?? []);
      }
      setLoading(false);
    });
  }, [clientId]);

  const getWeekStart = (): string => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const result = await submitWeeklyReview({
      client_id: clientId,
      week_start_date: getWeekStart(),
      bodyweight_kg: bodyweightKg,
      waist_cm: waistCm,
      hip_cm: hipCm,
      chest_cm: chestCm,
      adherence_score: adherenceScore,
      diet_satisfaction: dietSatisfaction,
      workout_consistency: workoutConsistency,
      challenges: challenges || null,
      wins: wins || null,
      goals_for_next_week: goals || null,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
      created_by: userId,
    });

    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      setSubmitted(true);
      toast({ title: 'Weekly review saved!', description: 'Your weekly review has been recorded.' });
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card className="p-6 shadow-card">
        <div className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold text-primary">This Week's Review Complete</h3>
          <p className="text-muted-foreground mt-2">
            Bodyweight: {bodyweightKg ? `${bodyweightKg} kg` : 'Not recorded'}
          </p>
        </div>
      </Card>
    );
  }

  const prevWeight = bodyweightKg;
  const defaultWeight = bodyweightKg;

  return (
    <Card className="p-6 shadow-card">
      <h2 className="text-2xl font-bold text-primary mb-6">Weekly Review</h2>

      <div className="space-y-6 max-w-md">
        {/* Bodyweight */}
        <div>
          <Label>Bodyweight (kg)</Label>
          <div className="flex gap-2 items-center mt-1">
            <Input
              type="number"
              step={0.1}
              value={bodyweightKg ?? ''}
              onChange={(e) => setBodyweightKg(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="75.0"
              className="flex-1"
            />
            {defaultWeight !== null && bodyweightKg !== null && (
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Δ {bodyweightKg - defaultWeight >= 0 ? '+' : ''}
                {(bodyweightKg - defaultWeight).toFixed(1)} kg
              </span>
            )}
          </div>
        </div>

        {/* Measurements */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Waist (cm)</Label>
            <Input
              type="number"
              step={0.1}
              value={waistCm ?? ''}
              onChange={(e) => setWaistCm(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="80"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Hip (cm)</Label>
            <Input
              type="number"
              step={0.1}
              value={hipCm ?? ''}
              onChange={(e) => setHipCm(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="95"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Chest (cm)</Label>
            <Input
              type="number"
              step={0.1}
              value={chestCm ?? ''}
              onChange={(e) => setChestCm(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="100"
              className="mt-1"
            />
          </div>
        </div>

        {/* Adherence Score */}
        <div>
          <Label className="flex justify-between">
            <span>Adherence Score</span>
            <span className="text-primary font-bold">{adherenceScore ?? '—'}%</span>
          </Label>
          <Slider
            value={[adherenceScore ?? 50]}
            onValueChange={([v]) => setAdherenceScore(v)}
            min={0}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        {/* Diet Satisfaction */}
        <div>
          <Label className="flex justify-between">
            <span>Diet Satisfaction</span>
            <span className="text-muted-foreground">{dietSatisfaction ?? '—'}/10</span>
          </Label>
          <Slider
            value={[dietSatisfaction ?? 5]}
            onValueChange={([v]) => setDietSatisfaction(v)}
            min={1}
            max={10}
            step={1}
            className="mt-2"
          />
        </div>

        {/* Workout Consistency */}
        <div>
          <Label className="flex justify-between">
            <span>Workout Consistency</span>
            <span className="text-primary font-bold">{workoutConsistency ?? '—'}%</span>
          </Label>
          <Slider
            value={[workoutConsistency ?? 50]}
            onValueChange={([v]) => setWorkoutConsistency(v)}
            min={0}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        {/* Qualitative Fields */}
        <div>
          <Label htmlFor="wins">Wins</Label>
          <Textarea
            id="wins"
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            placeholder="What went well this week?"
            rows={2}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="challenges">Challenges</Label>
          <Textarea
            id="challenges"
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            placeholder="What was difficult?"
            rows={2}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="goals">Goals for Next Week</Label>
          <Textarea
            id="goals"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="What do you want to focus on?"
            rows={2}
            className="mt-1"
          />
        </div>

        {/* Photo Upload (UI placeholder — actual upload via edge function) */}
        <div>
          <Label>Progress Photos</Label>
          <Button variant="outline" className="w-full mt-1" disabled>
            <Camera className="h-4 w-4 mr-2" /> Upload Photos
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            Photo upload coming soon. Photos will be stored via Supabase Storage.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            'Submit Weekly Review'
          )}
        </Button>
      </div>
    </Card>
  );
}
