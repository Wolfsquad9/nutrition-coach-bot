/**
 * DailyCheckinForm — mobile-first daily check-in form.
 *
 * Fields: meal adherence slider, workout toggle, energy/mood sliders,
 * sleep hours, water intake, weight, notes.
 */
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle, Flame, Moon, Droplets, Weight, Activity } from 'lucide-react';
import { submitDailyCheckin, getTodayCheckin } from '@/services/checkin/dailyCheckinService';
import { getStreak } from '@/services/checkin/streakService';
import { useToast } from '@/hooks/use-toast';
import type { CheckinStreak } from '@/types/checkin';

interface Props {
  clientId: string;
  userId: string;
}

export default function DailyCheckinForm({ clientId, userId }: Props) {
  const { toast } = useToast();

  // Form state
  const [mealAdherence, setMealAdherence] = useState(80);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);
  const [energyLevel, setEnergyLevel] = useState<number | null>(7);
  const [mood, setMood] = useState<number | null>(7);
  const [sleepHours, setSleepHours] = useState<number | null>(7);
  const [waterIntake, setWaterIntake] = useState<number | null>(2);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // Submission state
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [streak, setStreak] = useState<CheckinStreak | null>(null);
  const [loading, setLoading] = useState(true);

  // Load today's check-in + streak on mount
  useEffect(() => {
    Promise.all([
      getTodayCheckin(clientId),
      getStreak(clientId),
    ]).then(([checkinResult, streakResult]) => {
      if (checkinResult.checkin) {
        setSubmitted(true);
        setMealAdherence(checkinResult.checkin.meal_adherence);
        setWorkoutCompleted(checkinResult.checkin.workout_completed);
        setEnergyLevel(checkinResult.checkin.energy_level);
        setMood(checkinResult.checkin.mood);
        setSleepHours(checkinResult.checkin.sleep_hours);
        setWaterIntake(checkinResult.checkin.water_intake_liters);
        setCurrentWeight(checkinResult.checkin.current_weight_kg);
        setNotes(checkinResult.checkin.notes ?? '');
      }
      if (streakResult.streak) {
        setStreak(streakResult.streak);
      }
      setLoading(false);
    });
  }, [clientId]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    const result = await submitDailyCheckin({
      client_id: clientId,
      checkin_date: new Date().toISOString().slice(0, 10),
      meal_adherence: mealAdherence,
      workout_completed: workoutCompleted,
      energy_level: energyLevel,
      mood,
      sleep_hours: sleepHours,
      water_intake_liters: waterIntake,
      current_weight_kg: currentWeight,
      notes: notes || null,
      created_by: userId,
    });

    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      setSubmitted(true);
      toast({ title: 'Check-in saved!', description: 'Your daily check-in has been recorded.' });
      // Refresh streak
      const streakResult = await getStreak(clientId);
      if (streakResult.streak) setStreak(streakResult.streak);
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
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-primary">Today's Check-in Complete</h3>
          <p className="text-muted-foreground mt-2">
            Meal adherence: {mealAdherence}%
            {workoutCompleted && ' • Workout done'}
          </p>
          {streak && streak.current_streak > 1 && (
            <p className="text-sm text-primary mt-2">
              🔥 {streak.current_streak}-day streak!
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Daily Check-in</h2>
        {streak && streak.current_streak > 0 && (
          <div className="flex items-center gap-2 text-sm text-orange-500">
            <Flame className="h-4 w-4" />
            <span className="font-bold">{streak.current_streak} day streak</span>
          </div>
        )}
      </div>

      <div className="space-y-6 max-w-md">
        {/* Meal Adherence */}
        <div>
          <Label className="flex justify-between">
            <span className="flex items-center gap-2"><Activity className="h-4 w-4" /> Meal Adherence</span>
            <span className="text-primary font-bold">{mealAdherence}%</span>
          </Label>
          <Slider
            value={[mealAdherence]}
            onValueChange={([v]) => setMealAdherence(v)}
            min={0}
            max={100}
            step={5}
            className="mt-2"
          />
        </div>

        {/* Workout Completed */}
        <div className="flex items-center justify-between">
          <Label htmlFor="workout-today" className="flex items-center gap-2">
            Workout Completed Today
          </Label>
          <Switch
            id="workout-today"
            checked={workoutCompleted}
            onCheckedChange={setWorkoutCompleted}
          />
        </div>

        {/* Energy Level */}
        <div>
          <Label className="flex justify-between">
            <span>Energy Level</span>
            <span className="text-muted-foreground">{energyLevel ?? '—'}/10</span>
          </Label>
          <Slider
            value={[energyLevel ?? 5]}
            onValueChange={([v]) => setEnergyLevel(v)}
            min={1}
            max={10}
            step={1}
            className="mt-2"
          />
        </div>

        {/* Mood */}
        <div>
          <Label className="flex justify-between">
            <span>Mood</span>
            <span className="text-muted-foreground">{mood ?? '—'}/10</span>
          </Label>
          <Slider
            value={[mood ?? 5]}
            onValueChange={([v]) => setMood(v)}
            min={1}
            max={10}
            step={1}
            className="mt-2"
          />
        </div>

        {/* Sleep Hours */}
        <div>
          <Label className="flex items-center gap-2">
            <Moon className="h-4 w-4" /> Sleep Hours
          </Label>
          <Input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={sleepHours ?? ''}
            onChange={(e) => setSleepHours(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="7.5"
            className="mt-1"
          />
        </div>

        {/* Water Intake */}
        <div>
          <Label className="flex items-center gap-2">
            <Droplets className="h-4 w-4" /> Water Intake (L)
          </Label>
          <Input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={waterIntake ?? ''}
            onChange={(e) => setWaterIntake(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="2.0"
            className="mt-1"
          />
        </div>

        {/* Weight */}
        <div>
          <Label className="flex items-center gap-2">
            <Weight className="h-4 w-4" /> Current Weight (kg)
          </Label>
          <Input
            type="number"
            min={0}
            max={500}
            step={0.1}
            value={currentWeight ?? ''}
            onChange={(e) => setCurrentWeight(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Optional"
            className="mt-1"
          />
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="checkin-notes">Notes</Label>
          <Textarea
            id="checkin-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did your day go? Any challenges or wins?"
            rows={3}
            className="mt-1"
          />
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            'Submit Check-in'
          )}
        </Button>
      </div>
    </Card>
  );
}