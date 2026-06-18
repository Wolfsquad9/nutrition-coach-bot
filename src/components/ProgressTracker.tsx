import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Camera, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchProgressEntries,
  upsertProgressEntry,
  todayIso,
  latestWeightDelta,
  averageAdherence,
  type ProgressEntryView,
} from '@/services/progress';

interface ProgressTrackerProps {
  clientId: string;
  clientName: string;
}

export const ProgressTracker = ({ clientId, clientName }: ProgressTrackerProps) => {
  const [progressData, setProgressData] = useState<ProgressEntryView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<ProgressEntryView>>({
    weight: 0,
    bodyFat: 0,
    nutritionAdherence: 85
  });
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Load entries from Supabase on mount + when client/auth changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated || !clientId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const { data, error } = await fetchProgressEntries(clientId);
      if (cancelled) return;
      if (error) {
        toast({
          title: 'Could not load progress',
          description: error,
          variant: 'destructive',
        });
        setProgressData([]);
      } else {
        setProgressData(data ?? []);
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId, isAuthenticated, toast]);

  const handleAddEntry = async () => {
    if (!isAuthenticated) {
      toast({
        title: 'Not signed in',
        description: 'Please sign in to save progress entries.',
        variant: 'destructive',
      });
      return;
    }
    const pendingId = `pending-${Date.now()}`;
    const optimistic: ProgressEntryView = {
      id: pendingId,
      date: todayIso(),
      weight: newEntry.weight ?? 0,
      bodyFat: newEntry.bodyFat,
      nutritionAdherence: newEntry.nutritionAdherence ?? 0,
    };

    // Optimistic update so the UI feels instant
    const nextData = [...progressData, optimistic].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setProgressData(nextData);

    const { data, error } = await upsertProgressEntry({
      clientId,
      date: optimistic.date,
      weight: optimistic.weight,
      bodyFat: optimistic.bodyFat ?? null,
      nutritionAdherence: optimistic.nutritionAdherence,
    });

    if (error) {
      // Roll back optimistic update
      setProgressData(progressData);
      toast({
        title: 'Could not save progress',
        description: error,
        variant: 'destructive',
      });
      return;
    }

    if (data) {
      // Replace optimistic entry with the server row (has the real id)
      setProgressData(nextData.map((e) => (e.id === pendingId ? data : e)));
    }

    toast({
      title: 'Progress Updated',
      description: 'New progress entry has been added successfully.',
    });

    setShowAddEntry(false);
    setNewEntry({ weight: 0, bodyFat: 0, nutritionAdherence: 85 });
  };

  // Pure helpers from the service keep business logic in one place
  const weightDelta = latestWeightDelta(progressData);
  const avgAdherence = averageAdherence(progressData);

  return (
    <div className="space-y-6">
      <Card className="p-6 shadow-card">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-primary">Progress Tracking</h2>
            <p className="text-muted-foreground">Track {clientName}'s journey</p>
          </div>
          <Button onClick={() => setShowAddEntry(!showAddEntry)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-card p-4 rounded-lg">
            <p className="text-muted-foreground text-sm">Weight Change</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">
                {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)} kg
              </p>
              {weightDelta < 0 ? (
                <TrendingDown className="w-5 h-5 text-success" />
              ) : weightDelta > 0 ? (
                <TrendingUp className="w-5 h-5 text-warning" />
              ) : null}
            </div>
          </div>

          <div className="bg-gradient-card p-4 rounded-lg">
            <p className="text-muted-foreground text-sm">Current Weight</p>
            <p className="text-2xl font-bold text-primary">
              {progressData.length ? progressData[progressData.length - 1].weight : '—'} kg
            </p>
          </div>

          <div className="bg-gradient-card p-4 rounded-lg">
            <p className="text-muted-foreground text-sm">Avg. Adherence</p>
            <p className="text-2xl font-bold text-accent">{avgAdherence}%</p>
          </div>
        </div>

        {/* Add Entry Form */}
        {showAddEntry && (
          <Card className="p-4 mb-6 border-2 border-primary/20">
            <h3 className="font-semibold mb-4">New Progress Entry</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={newEntry.weight}
                  onChange={(e) => setNewEntry({ ...newEntry, weight: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="bodyFat">Body Fat %</Label>
                <Input
                  id="bodyFat"
                  type="number"
                  step="0.1"
                  value={newEntry.bodyFat}
                  onChange={(e) => setNewEntry({ ...newEntry, bodyFat: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="adherence">Nutrition Adherence %</Label>
                <Input
                  id="adherence"
                  type="number"
                  min="0"
                  max="100"
                  value={newEntry.nutritionAdherence}
                  onChange={(e) => setNewEntry({ ...newEntry, nutritionAdherence: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleAddEntry}>Save Entry</Button>
              <Button variant="outline" onClick={() => setShowAddEntry(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Progress Chart */}
        {progressData.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="weight"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="adherence"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weight"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Weight (kg)"
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line
                yAxisId="adherence"
                type="monotone"
                dataKey="nutritionAdherence"
                stroke="hsl(var(--secondary))"
                strokeWidth={2}
                name="Adherence %"
                dot={{ fill: 'hsl(var(--secondary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Loading progress…
          </p>
        )}
        {!isLoading && progressData.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No progress entries yet. Click "Add Entry" to start tracking.
          </p>
        )}

        {/* Photo Upload Placeholder */}
        <div className="mt-6 p-4 border-2 border-dashed border-border rounded-lg text-center">
          <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Progress photos coming soon</p>
        </div>
      </Card>
    </div>
  );
};
