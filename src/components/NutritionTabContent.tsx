/**
 * NutritionTabContent - Dedicated component for nutrition tab with Draft → Lock lifecycle
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, Calendar, AlertCircle, Database, CloudOff, Lock, Unlock, FileEdit, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNutritionPlanState, type PlanState } from '@/hooks/useNutritionPlanState';
import { useIngredientValidation, INGREDIENT_MINIMUMS } from '@/hooks/useIngredientValidation';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { generateWeeklyMealPlan, generateFullDayMealPlan, type FullDayMealPlanResult } from '@/services/recipeService';
import { DailyMealPlanDisplay } from '@/components/DailyMealPlanDisplay';
import { LockPlanButton, DiscardDraftButton } from '@/components/LockPlanButton';
import { getClientLabel } from '@/utils/clientHelpers';
import { resolveSnapshotWeeklyPlan } from '@/utils/snapshotResolver';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const WeeklyMealPlanDisplay = lazy(() =>
  import('@/components/WeeklyMealPlanDisplay').then(module => ({ default: module.WeeklyMealPlanDisplay }))
);

interface NutritionTabContentProps {
  activeClientId: string;
  activeClient: Client;
  clientRestrictions: ClientIngredientRestrictions[];
}

// State indicator badge component
function PlanStateIndicator({ state, lockStatus }: { state: PlanState; lockStatus?: { isLocked: boolean; daysRemaining: number } }) {
  const config: Record<PlanState, { label: string; variant: 'default' | 'secondary' | 'outline'; className: string; icon: React.ReactNode }> = {
    EMPTY: { label: 'Aucun plan', variant: 'outline', className: 'text-muted-foreground border-muted', icon: <CloudOff className="w-3 h-3 mr-1" /> },
    DRAFT: { label: 'Brouillon', variant: 'secondary', className: 'bg-warning/20 text-warning border-warning/30', icon: <FileEdit className="w-3 h-3 mr-1" /> },
    LOCKED: { 
      label: lockStatus?.isLocked ? `Verrouillé (${lockStatus.daysRemaining}j)` : 'Enregistré', 
      variant: 'default', 
      className: lockStatus?.isLocked ? 'bg-info/20 text-info border-info/30' : 'bg-success/20 text-success border-success/30',
      icon: lockStatus?.isLocked ? <Lock className="w-3 h-3 mr-1" /> : <Database className="w-3 h-3 mr-1" />
    },
    EXPIRED: { label: 'Verrou expiré', variant: 'default', className: 'bg-success/20 text-success border-success/30', icon: <Unlock className="w-3 h-3 mr-1" /> },
    LOADING: { label: 'Chargement...', variant: 'outline', className: 'text-muted-foreground animate-pulse', icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    SAVING: { label: 'Verrouillage...', variant: 'outline', className: 'text-primary animate-pulse', icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    ERROR: { label: 'Erreur', variant: 'secondary', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3 mr-1" /> },
  };

  const { label, variant, className, icon } = config[state];

  return (
    <Badge variant={variant} className={className}>
      {icon}{label}
    </Badge>
  );
}

export function NutritionTabContent({ activeClientId, activeClient, clientRestrictions }: NutritionTabContentProps) {
  const { toast } = useToast();
  const planState = useNutritionPlanState();
  const ingredientValidation = useIngredientValidation(activeClientId, clientRestrictions);

  const [dailyMealPlan, setDailyMealPlan] = useState<FullDayMealPlanResult | null>(null);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  // Load plan whenever client changes
  useEffect(() => {
    if (activeClientId) {
      planState.loadPlanForClient(activeClientId);
      setDailyMealPlan(null);
    }
  }, [activeClientId, planState]);

  const getLikedFoods = useCallback((): string[] => {
    const restriction = clientRestrictions.find(r => r.clientId === activeClientId);
    return restriction?.preferredIngredients || [];
  }, [activeClientId, clientRestrictions]);

  const handleGenerateDailyPlan = useCallback(async () => {
    if (planState.isBlocked) return toast({ title: 'Opération bloquée', description: 'Résolvez les erreurs avant de continuer.', variant: 'destructive' });

    const validation = ingredientValidation.validateForPlanType('daily');
    if (!validation.valid) return toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });

    setIsGeneratingDaily(true);
    try {
      const likedFoods = getLikedFoods();
      const metrics = calculateNutritionMetrics(activeClient);
      const result = generateFullDayMealPlan(likedFoods, {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      });
      setDailyMealPlan(result);
      toast({ title: 'Plan journalier généré !', description: `${result.totalMacros.calories} kcal` });
    } catch (err: unknown) {
      console.error('Error generating daily plan:', err);
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Impossible de générer le plan journalier', variant: 'destructive' });
    } finally {
      setIsGeneratingDaily(false);
    }
  }, [planState, ingredientValidation, getLikedFoods, activeClient, toast]);

  const handleGenerateWeeklyPlan = useCallback(async () => {
    if (planState.isBlocked) return toast({ title: 'Opération bloquée', description: 'Résolvez les erreurs avant de continuer.', variant: 'destructive' });

    if (planState.isLocked && planState.lockStatus?.isLocked) {
      return toast({ title: 'Plan verrouillé', description: `Le plan est verrouillé pour ${planState.lockStatus?.daysRemaining ?? 0} jour(s).`, variant: 'destructive' });
    }

    const validation = ingredientValidation.validateForPlanType('weekly');
    if (!validation.valid) return toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });

    setIsGeneratingWeekly(true);
    setDailyMealPlan(null);

    try {
      const likedFoods = getLikedFoods();
      const metrics = calculateNutritionMetrics(activeClient);
      const weeklyPlan = generateWeeklyMealPlan(likedFoods, {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      });

      planState.setDraftPlan(weeklyPlan, { calories: metrics.targetCalories, protein: metrics.proteinGrams, carbs: metrics.carbsGrams, fat: metrics.fatGrams }, likedFoods);
      toast({ title: 'Brouillon généré !', description: 'Le plan est en mode brouillon. Cliquez sur "Verrouiller le Plan" pour l\'enregistrer.' });
    } catch (err: unknown) {
      console.error('Error generating weekly plan:', err);
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Impossible de générer le plan hebdomadaire', variant: 'destructive' });
    } finally {
      setIsGeneratingWeekly(false);
    }
  }, [planState, ingredientValidation, getLikedFoods, activeClient, toast]);

  const handleLockPlan = useCallback(async () => {
    const result = await planState.lockPlan(activeClientId, {
      firstName: activeClient.firstName,
      lastName: activeClient.lastName,
      goal: activeClient.primaryGoal,
      activityLevel: activeClient.activityLevel,
    });
    if (result.success) toast({ title: 'Plan verrouillé !', description: 'Le plan a été enregistré et verrouillé pour 7 jours.' });
    else toast({ title: 'Échec du verrouillage', description: result.error || 'Le plan n\'a pas pu être verrouillé.', variant: 'destructive' });
  }, [planState, activeClientId, activeClient, toast]);

  const handleDiscardDraft = useCallback(async () => {
    planState.discardDraft?.(activeClientId);
    toast({ title: 'Brouillon annulé', description: 'Le brouillon a été supprimé.' });
  }, [planState, activeClientId, toast]);

  const handleReloadPlan = useCallback(() => {
    planState.loadPlanForClient(activeClientId);
    toast({ title: 'Rechargement', description: 'Le plan est rechargé depuis la base de données.' });
  }, [planState, activeClientId, toast]);

  const isGenerating = isGeneratingDaily || isGeneratingWeekly;
  const hasWeeklyPlan = !!planState.weeklyPlan;
  const hasDailyPlan = !!dailyMealPlan;
  const hasAnyPlan = hasWeeklyPlan || hasDailyPlan;

  const regenerationBlocked = planState.isLocked && planState.lockStatus?.isLocked;

  const snapshotWeeklyPlan = useMemo(() => {
    try {
      return resolveSnapshotWeeklyPlan({
        activeClientId,
        isLocked: planState.isLocked,
        lockIsActive: planState.lockStatus?.isLocked ?? false,
        weeklyPlan: planState.weeklyPlan,
        macroTargets: planState.macroTargets,
        likedIngredients: planState.likedIngredients,
        pendingOverrides: planState.pendingOverrides,
        planId: planState.planId,
        versionId: planState.versionId,
        planCreatedAt: planState.planCreatedAt,
        planGeneratedAt: planState.planCreatedAt,
        planLockedAt: planState.lockedAt,
        snapshot: planState.snapshot,
      });
    } catch (error) {
      console.error('Failed to build plan snapshot, falling back to source weekly plan.', error);
      return planState.weeklyPlan;
    }
  }, [
    activeClientId,
    planState.isLocked,
    planState.lockStatus?.isLocked,
    planState.weeklyPlan,
    planState.macroTargets,
    planState.likedIngredients,
    planState.pendingOverrides,
    planState.planId,
    planState.versionId,
    planState.planCreatedAt,
    planState.lockedAt,
    planState.snapshot,
  ]);

  const displayWeeklyPlan = snapshotWeeklyPlan ?? planState.weeklyPlan;

  // --- UI rendering omitted for brevity (unchanged from your version) ---
  return (
    <div className="space-y-4">
      {/* ... all your Card/Alert/UI code remains the same ... */}
    </div>
  );
}
