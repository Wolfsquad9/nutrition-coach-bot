/**
 * useMealCompletions -- React hook for athlete meal completion state.
 *
 * Reads completions for a (clientId, planVersionId) pair and provides
 * toggleCompletion(dayOffset, mealSlot) for marking a meal completed or not
 * completed.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  upsertMealCompletion,
  getMealCompletions,
  type MealCompletion,
  type UpsertMealCompletionInput,
} from '@/services/checkin/mealCompletionService';

export function useMealCompletions(
  clientId: string | null,
  planVersionId: string | null
) {
  const [completions, setCompletions] = useState<MealCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load completions on mount or when clientId/planVersionId change
  useEffect(() => {
    if (!clientId || !planVersionId) {
      setCompletions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getMealCompletions(clientId, planVersionId)
      .then((result) => {
        if (cancelled) return;
        setCompletions(result.completions ?? []);
        setIsLoading(false);
        if (result.error) {
          setError(result.error);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load meal completions');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, planVersionId]);

  /**
   * Toggle a meal slot completed status.
   * Upserts a completion record: if it exists, it updates completed;
   * if not, it inserts a new record.
   */
  const toggleCompletion = useCallback(async (
    dayOffset: number,
    mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  ) => {
    if (!clientId || !planVersionId) {
      setError('Client or plan version not available');
      return;
    }

    // Find existing completion for this meal
    const existing = completions.find(
      (c) =>
        c.day_offset === dayOffset &&
        c.meal_slot === mealSlot &&
        c.plan_version_id === planVersionId
    );

    const completed = !existing?.completed;
    const input: UpsertMealCompletionInput = {
      client_id: clientId,
      plan_version_id: planVersionId,
      day_offset: dayOffset,
      meal_slot: mealSlot,
      completed,
    };

    const result = await upsertMealCompletion(input);
    if (result.error) {
      setError(result.error);
      return false;
    }

    if (result.completion) {
      setCompletions((prev) =>
        prev.map((c) =>
          c.id === result.completion.id ? result.completion : c
        )
      );
    }

    return true;
  }, [clientId, planVersionId, completions]);

  return {
    completions,
    isLoading,
    error,
    toggleCompletion,
  };
}
