/**
 * NutritionTabContent - Nutrition tab with Draft → Lock lifecycle
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CalendarDays,
  Calendar,
  AlertCircle,
  Database,
  CloudOff,
  Lock,
  Unlock,
  FileEdit,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNutritionPlanState, type PlanState } from '@/hooks/useNutritionPlanState';
import { useIngredientValidation, INGREDIENT_MINIMUMS } from '@/hooks/useIngredientValidation';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { generateWeeklyMealPlan, generateFullDayMealPlan, type FullDayMealPlanResult } from '@/services/recipeService';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import { DailyMealPlanDisplay } from '@/components/DailyMealPlanDisplay';
import { LockPlanButton, DiscardDraftButton } from '@/components/LockPlanButton';
import { SharePlanButton } from '@/components/SharePlanButton';
import { getClientLabel } from '@/utils/clientHelpers';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

interface NutritionTabContentProps {
  activeClientId: string;
  activeClient: Client;
  clientRestrictions: ClientIngredientRestrictions[];
}

function PlanStateIndicator({ state, lockStatus }: { state: PlanState; lockStatus: { isLocked: boolean; daysRemaining: number } }) {
  const config: Record<PlanState, { label: string; variant: 'default' | 'secondary' | 'outline'; className: string; icon: React.ReactNode }> = {
    EMPTY:   { label: 'No plan',          variant: 'outline',    className: 'text-muted-foreground border-muted',              icon: <CloudOff className="w-3 h-3 mr-1" /> },
    DRAFT:   { label: 'Draft',            variant: 'secondary',  className: 'bg-warning/20 text-warning border-warning/30',    icon: <FileEdit className="w-3 h-3 mr-1" /> },
    LOCKED:  {
      label: lockStatus.isLocked ? `Locked (${lockStatus.daysRemaining}d)` : 'Saved',
      variant: 'default',
      className: lockStatus.isLocked ? 'bg-info/20 text-info border-info/30' : 'bg-success/20 text-success border-success/30',
      icon: lockStatus.isLocked ? <Lock className="w-3 h-3 mr-1" /> : <Database className="w-3 h-3 mr-1" />,
    },
    EXPIRED: { label: 'Lock expired',     variant: 'default',    className: 'bg-success/20 text-success border-success/30',    icon: <Unlock className="w-3 h-3 mr-1" /> },
    LOADING: { label: 'Loading...',       variant: 'outline',    className: 'text-muted-foreground animate-pulse',             icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    SAVING:  { label: 'Locking...',       variant: 'outline',    className: 'text-primary animate-pulse',                      icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    ERROR:   { label: 'Error',            variant: 'secondary',  className: 'bg-destructive/20 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3 mr-1" /> },
  };

  const { label, variant, className, icon } = config[state];
  return <Badge variant={variant} className={className}>{icon}{label}</Badge>;
}

const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

export function NutritionTabContent({ activeClientId, activeClient, clientRestrictions }: NutritionTabContentProps) {
  const { toast } = useToast();

  const planState = useNutritionPlanState();
  const ingredientValidation = useIngredientValidation(activeClientId, clientRestrictions);

  const [dailyMealPlan, setDailyMealPlan] = useState<FullDayMealPlanResult | null>(null);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  useEffect(() => {
    if (activeClientId) {
      planState.loadPlanForClient(activeClientId);
      setDailyMealPlan(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId]);

  const getLikedFoods = useCallback(() => {
    const restriction = clientRestrictions.find(r => r.clientId === activeClientId);
    return restriction?.preferredIngredients || [];
  }, [activeClientId, clientRestrictions]);

  const handleGenerateDailyPlan = async () => {
    if (planState.isBlocked) return toast({ title: 'Operation blocked', description: 'Resolve the error before generating.', variant: 'destructive' });

    const validation = ingredientValidation.validateForPlanType('daily');
    if (!validation.valid) return toast({ title: 'Not enough ingredients', description: validation.message, variant: 'destructive' });

    setIsGeneratingDaily(true);
    try {
      const likedFoods = getLikedFoods();
      const metrics = calculateNutritionMetrics(activeClient);
      const macroTargets = {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      };
      const result = generateFullDayMealPlan(likedFoods, macroTargets);
      setDailyMealPlan(result);
      toast({ title: 'Daily plan generated!', description: `${result.totalMacros.calories} kcal` });
    } catch (err: unknown) {
      toast({ title: 'Error', description: getErrorMessage(err, 'Unable to generate daily plan'), variant: 'destructive' });
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  const handleGenerateWeeklyPlan = async () => {
    if (planState.isBlocked) return toast({ title: 'Operation blocked', description: 'Resolve the error before generating.', variant: 'destructive' });
    if (planState.isLocked && planState.lockStatus.isLocked) return toast({ title: 'Plan locked', description: `Plan is locked for ${planState.lockStatus.daysRemaining} day(s).`, variant: 'destructive' });

    const validation = ingredientValidation.validateForPlanType('weekly');
    if (!validation.valid) return toast({ title: 'Not enough ingredients', description: validation.message, variant: 'destructive' });

    setIsGeneratingWeekly(true);
    setDailyMealPlan(null);

    try {
      const likedFoods = getLikedFoods();
      const metrics = calculateNutritionMetrics(activeClient);
      const macroTargets = {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      };
      const weeklyPlan = generateWeeklyMealPlan(likedFoods, macroTargets);
      planState.setDraftPlan(weeklyPlan, macroTargets, likedFoods);
      toast({ title: 'Draft generated!', description: 'Plan is in draft mode. Click "Lock Plan" to save it.' });
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
    if (result.success) toast({ title: 'Plan locked!', description: 'The plan has been saved and locked for 7 days.' });
    else toast({ title: 'Lock failed', description: result.error || 'The plan could not be locked.', variant: 'destructive' });
  };

  const handleDiscardDraft = async () => {
    await planState.discardDraft();
    toast({ title: 'Draft discarded', description: 'The draft has been removed.' });
  };

  const handleReloadPlan = () => {
    planState.loadPlanForClient(activeClientId);
    toast({ title: 'Reloading', description: 'Reloading plan from database.' });
  };

  const isGenerating = isGeneratingDaily || isGeneratingWeekly;
  const hasWeeklyPlan = !!planState.resolvedWeeklyPlan;
  const hasDailyPlan = !!dailyMealPlan;
  const hasAnyPlan = hasWeeklyPlan || hasDailyPlan;
  const regenerationBlocked = planState.isLocked && planState.lockStatus.isLocked;

  return (
    <div className="space-y-4">
      <Card className="p-4 shadow-card bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Client:</span>
            <span className="font-semibold text-foreground">{getClientLabel(activeClient)}</span>
          </div>
          <div className="flex items-center gap-2">
            <PlanStateIndicator state={planState.state} lockStatus={planState.lockStatus} />
            {(planState.isLocked || planState.state === 'ERROR') && (
              <Button variant="ghost" size="sm" onClick={handleReloadPlan} disabled={planState.isLoading}>
                <RefreshCw className={`h-4 w-4 ${planState.isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {planState.isDraft && (
        <Alert className="border-warning/50 bg-warning/10">
          <FileEdit className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning"><strong>Draft Mode</strong> — This plan is not yet saved.</AlertDescription>
        </Alert>
      )}
      {planState.isLocked && !planState.lockStatus.isLocked && (
        <Alert className="border-success/50 bg-success/10">
          <Unlock className="h-4 w-4 text-success" />
          <AlertDescription className="text-success"><strong>Lock expired</strong> — A new plan can be generated.</AlertDescription>
        </Alert>
      )}
      {!ingredientValidation.canGenerateWeekly && (
        <Alert variant="default" className="border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">{ingredientValidation.validationMessage}</AlertDescription>
        </Alert>
      )}
      {planState.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{planState.error}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6 shadow-card">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
              <CalendarDays className="h-6 w-6" /> Meal Plan Generation
            </h2>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleGenerateDailyPlan} disabled={isGenerating || !ingredientValidation.canGenerateDaily || planState.isBlocked} variant="outline">
              {isGeneratingDaily ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><CalendarDays className="mr-2 h-4 w-4" />Daily Plan</>}
            </Button>
            <Button onClick={handleGenerateWeeklyPlan} disabled={isGenerating || !ingredientValidation.canGenerateWeekly || regenerationBlocked || planState.isBlocked} variant={planState.isDraft ? "outline" : "default"}>
              {isGeneratingWeekly ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Calendar className="mr-2 h-4 w-4" />{planState.isDraft ? 'Regenerate' : 'Weekly Plan'}</>}
            </Button>
            {planState.isDraft && <DiscardDraftButton onDiscard={handleDiscardDraft} disabled={planState.isSaving} />}
            <LockPlanButton canLock={planState.canLock} isLocking={planState.isSaving} onLock={handleLockPlan} disabled={!ingredientValidation.canGenerateWeekly || planState.isBlocked} />
            <SharePlanButton versionId={planState.versionId} isShareable={planState.isShareable} />
          </div>
        </div>
      </Card>

      {planState.isLoading && (
        <Card className="p-12 shadow-card">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading plan from database...</p>
          </div>
        </Card>
      )}

      {hasWeeklyPlan && !planState.isLoading && <WeeklyMealPlanDisplay weeklyPlan={planState.resolvedWeeklyPlan!} />}
      {hasDailyPlan && !planState.isLoading && <DailyMealPlanDisplay {...dailyMealPlan} />}

      {!hasAnyPlan && !planState.isLoading && planState.state !== 'ERROR' && (
        <Card className="p-6 shadow-card">
          <div className="text-center py-8">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No nutrition plan</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {ingredientValidation.canGenerateWeekly
                ? 'Generate a weekly plan to create a personalized nutrition program.'
                : `Select at least ${INGREDIENT_MINIMUMS.weeklyPlan} liked ingredients to generate a plan.`}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
