/**
 * NutritionTabContent - Fixed & Fully Working Version
 * Implements Draft → Lock lifecycle with proper UI rendering
 */

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, Calendar, AlertCircle, Database, CloudOff, Lock, Unlock, RefreshCw, FileEdit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNutritionPlanState, type PlanState } from '@/hooks/useNutritionPlanState';
import { useIngredientValidation, INGREDIENT_MINIMUMS } from '@/hooks/useIngredientValidation';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { generateWeeklyMealPlan, generateFullDayMealPlan, type FullDayMealPlanResult } from '@/services/recipeService';
import { DailyMealPlanDisplay } from '@/components/DailyMealPlanDisplay';
import { PlanLockIndicator } from '@/components/DataSourceIndicator';
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

function PlanStateIndicator({ state, lockStatus }: { 
  state: PlanState; 
  lockStatus: { isLocked: boolean; daysRemaining: number };
}) {
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
  return <Badge variant={variant} className={className}>{icon}{label}</Badge>;
}

export function NutritionTabContent({ activeClientId, activeClient, clientRestrictions }: NutritionTabContentProps) {
  const { toast } = useToast();
  const planState = useNutritionPlanState();
  const ingredientValidation = useIngredientValidation(activeClientId, clientRestrictions);

  const [dailyMealPlan, setDailyMealPlan] = useState<FullDayMealPlanResult | null>(null);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  // Load plan when client changes
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

  const handleGenerateDailyPlan = async () => {
    if (planState.isBlocked) {
      toast({ title: 'Opération bloquée', description: 'Une erreur précédente doit être résolue.', variant: 'destructive' });
      return;
    }
    const validation = ingredientValidation.validateForPlanType('daily');
    if (!validation.valid) {
      toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });
      return;
    }
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
      console.error(err);
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Impossible de générer le plan journalier', variant: 'destructive' });
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  const handleGenerateWeeklyPlan = async () => {
    if (planState.isBlocked) {
      toast({ title: 'Opération bloquée', description: 'Une erreur précédente doit être résolue.', variant: 'destructive' });
      return;
    }
    if (planState.lockStatus?.isLocked) {
      toast({ title: 'Plan verrouillé', description: `Le plan est verrouillé pour ${planState.lockStatus.daysRemaining} jour(s).`, variant: 'destructive' });
      return;
    }
    const validation = ingredientValidation.validateForPlanType('weekly');
    if (!validation.valid) {
      toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });
      return;
    }
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
      planState.setDraftPlan(weeklyPlan, {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      }, likedFoods);
      toast({ title: 'Brouillon généré !', description: 'Cliquez sur "Verrouiller le Plan" pour l\'enregistrer.' });
    } catch (err: unknown) {
      console.error(err);
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Impossible de générer le plan hebdomadaire', variant: 'destructive' });
    } finally {
      setIsGeneratingWeekly(false);
    }
  };

  const handleLockPlan = async () => {
    const result = await planState.lockPlan(activeClientId, {
      firstName: activeClient.firstName,
      lastName: activeClient.lastName,
      goal: activeClient.primaryGoal,
      activityLevel: activeClient.activityLevel,
    });
    if (result.success) {
      toast({ title: 'Plan verrouillé !', description: 'Le plan a été enregistré et verrouillé pour 7 jours.' });
    } else {
      toast({ title: 'Échec du verrouillage', description: result.error || 'Le plan n\'a pas pu être verrouillé.', variant: 'destructive' });
    }
  };

  const handleDiscardDraft = async () => {
    planState.clearState();
    toast({ title: 'Brouillon annulé', description: 'Le brouillon a été supprimé.' });
  };

  const handleReloadPlan = () => {
    planState.loadPlanForClient(activeClientId);
    toast({ title: 'Rechargement', description: 'Le plan est rechargé depuis la base de données.' });
  };

  const isGenerating = isGeneratingDaily || isGeneratingWeekly;
  const regenerationBlocked = planState.lockStatus?.isLocked ?? false;

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
        planGeneratedAt: planState.planGeneratedAt,
        planLockedAt: planState.planLockedAt,
        snapshot: planState.snapshot,
      });
    } catch {
      return planState.weeklyPlan;
    }
  }, [
    activeClientId,
    planState.weeklyPlan,
    planState.macroTargets,
    planState.likedIngredients,
    planState.pendingOverrides,
    planState.planId,
    planState.versionId,
    planState.planCreatedAt,
    planState.planGeneratedAt,
    planState.planLockedAt,
    planState.snapshot,
    planState.isLocked,
    planState.lockStatus,
  ]);

  const displayWeeklyPlan = snapshotWeeklyPlan ?? planState.weeklyPlan;

  return (
    <div className="space-y-4">
      {/* Client & Status Header */}
      <Card className="p-4 shadow-card bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Client:</span>
            <span className="font-semibold text-foreground">{getClientLabel(activeClient)}</span>
          </div>
          <div className="flex items-center gap-2">
            <PlanStateIndicator state={planState.state} lockStatus={planState.lockStatus ?? { isLocked: false, daysRemaining: 0 }} />
            {(planState.isLocked || planState.state === 'ERROR') && (
              <Button variant="ghost" size="sm" onClick={handleReloadPlan} disabled={planState.uiState === 'LOADING'}>
                <RefreshCw className={`h-4 w-4 ${planState.uiState === 'LOADING' ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Draft / Lock / Errors / Alerts */}
      {planState.isDraft && <Alert className="border-warning/50 bg-warning/10"><FileEdit className="h-4 w-4 text-warning" /><AlertDescription>Mode brouillon actif.</AlertDescription></Alert>}
      {planState.lockStatus && !planState.lockStatus.isLocked && planState.isLocked && <Alert className="border-success/50 bg-success/10"><Unlock className="h-4 w-4 text-success" /><AlertDescription>Verrou expiré</AlertDescription></Alert>}
      {planState.error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{planState.error}</AlertDescription></Alert>}

      {/* Generation Controls */}
      <Card className="p-6 shadow-card">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-primary flex items-center gap-2"><CalendarDays className="h-6 w-6" /> Génération de Plans Repas</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {planState.isDraft ? 'Plan en brouillon.' : regenerationBlocked ? `Plan verrouillé pour ${planState.lockStatus?.daysRemaining ?? 0} jour(s)` : 'Générez un nouveau plan.'}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleGenerateDailyPlan} disabled={isGenerating || !ingredientValidation.canGenerateDaily || planState.isBlocked} variant="outline">{isGeneratingDaily ? 'Génération...' : 'Plan Journalier'}</Button>
            <Button onClick={handleGenerateWeeklyPlan} disabled={isGenerating || !ingredientValidation.canGenerateWeekly || regenerationBlocked || planState.isBlocked} variant={planState.isDraft ? "outline" : "default"}>Plan Hebdomadaire</Button>
            {planState.isDraft && <DiscardDraftButton onDiscard={handleDiscardDraft} disabled={planState.uiState === 'SAVING'} />}
            <LockPlanButton canLock={planState.canLock} isLocking={planState.uiState === 'SAVING'} onLock={handleLockPlan} disabled={!ingredientValidation.canGenerateWeekly || planState.isBlocked} />
          </div>
        </div>
      </Card>

      {/* Weekly Plan Display */}
      {displayWeeklyPlan && !planState.isLoading && (
        <Suspense fallback={<Card className="p-6 shadow-card"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</Card>}>
          <WeeklyMealPlanDisplay weeklyPlan={displayWeeklyPlan} />
        </Suspense>
      )}

      {/* Daily Plan Display */}
      {dailyMealPlan && !planState.isLoading && <DailyMealPlanDisplay {...dailyMealPlan} />}

      {/* Empty State */}
      {!displayWeeklyPlan && !dailyMealPlan && !planState.isLoading && (
        <Card className="p-6 shadow-card text-center">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Aucun plan nutritionnel</h3>
        </Card>
      )}
    </div>
  );
}
