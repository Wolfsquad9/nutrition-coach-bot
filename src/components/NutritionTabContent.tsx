/**
 * NutritionTabContent - Nutrition tab with Draft → Lock lifecycle
 * Fixed: err:any → unknown with getErrorMessage pattern
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
    EMPTY:   { label: 'Aucun plan',       variant: 'outline',    className: 'text-muted-foreground border-muted',              icon: <CloudOff className="w-3 h-3 mr-1" /> },
    DRAFT:   { label: 'Brouillon',        variant: 'secondary',  className: 'bg-warning/20 text-warning border-warning/30',    icon: <FileEdit className="w-3 h-3 mr-1" /> },
    LOCKED:  {
      label: lockStatus.isLocked ? `Verrouillé (${lockStatus.daysRemaining}j)` : 'Enregistré',
      variant: 'default',
      className: lockStatus.isLocked ? 'bg-info/20 text-info border-info/30' : 'bg-success/20 text-success border-success/30',
      icon: lockStatus.isLocked ? <Lock className="w-3 h-3 mr-1" /> : <Database className="w-3 h-3 mr-1" />,
    },
    EXPIRED: { label: 'Verrou expiré',    variant: 'default',    className: 'bg-success/20 text-success border-success/30',    icon: <Unlock className="w-3 h-3 mr-1" /> },
    LOADING: { label: 'Chargement...',    variant: 'outline',    className: 'text-muted-foreground animate-pulse',             icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    SAVING:  { label: 'Verrouillage...', variant: 'outline',    className: 'text-primary animate-pulse',                      icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" /> },
    ERROR:   { label: 'Erreur',          variant: 'secondary',  className: 'bg-destructive/20 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3 mr-1" /> },
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
    if (planState.isBlocked) return toast({ title: 'Opération bloquée', description: 'Résolvez l\'erreur avant de générer.', variant: 'destructive' });

    const validation = ingredientValidation.validateForPlanType('daily');
    if (!validation.valid) return toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });

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
      toast({ title: 'Plan journalier généré !', description: `${result.totalMacros.calories} kcal` });
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: getErrorMessage(err, 'Impossible de générer le plan journalier'), variant: 'destructive' });
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  const handleGenerateWeeklyPlan = async () => {
    if (planState.isBlocked) return toast({ title: 'Opération bloquée', description: 'Résolvez l\'erreur avant de générer.', variant: 'destructive' });
    if (planState.isLocked && planState.lockStatus.isLocked) return toast({ title: 'Plan verrouillé', description: `Plan verrouillé pour ${planState.lockStatus.daysRemaining} jour(s).`, variant: 'destructive' });

    const validation = ingredientValidation.validateForPlanType('weekly');
    if (!validation.valid) return toast({ title: 'Ingrédients insuffisants', description: validation.message, variant: 'destructive' });

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
      toast({ title: 'Brouillon généré !', description: 'Le plan est en mode brouillon. Cliquez sur "Verrouiller le Plan" pour l\'enregistrer.' });
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
    if (result.success) toast({ title: 'Plan verrouillé !', description: 'Le plan a été enregistré et verrouillé pour 7 jours.' });
    else toast({ title: 'Échec du verrouillage', description: result.error || 'Le plan n\'a pas pu être verrouillé.', variant: 'destructive' });
  };

  const handleDiscardDraft = async () => {
    await planState.discardDraft(activeClientId);
    toast({ title: 'Brouillon annulé', description: 'Le brouillon a été supprimé.' });
  };

  const handleReloadPlan = () => {
    planState.loadPlanForClient(activeClientId);
    toast({ title: 'Rechargement', description: 'Le plan est rechargé depuis la base de données.' });
  };

  const isGenerating = isGeneratingDaily || isGeneratingWeekly;
  const hasWeeklyPlan = !!planState.weeklyPlan;
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
          <AlertDescription className="text-warning"><strong>Mode Brouillon</strong> — Ce plan n'est pas encore enregistré.</AlertDescription>
        </Alert>
      )}
      {planState.isLocked && !planState.lockStatus.isLocked && (
        <Alert className="border-success/50 bg-success/10">
          <Unlock className="h-4 w-4 text-success" />
          <AlertDescription className="text-success"><strong>Verrou expiré</strong> — Nouveau plan possible.</AlertDescription>
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
              <CalendarDays className="h-6 w-6" /> Génération de Plans Repas
            </h2>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleGenerateDailyPlan} disabled={isGenerating || !ingredientValidation.canGenerateDaily || planState.isBlocked} variant="outline">
              {isGeneratingDaily ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Génération...</> : <><CalendarDays className="mr-2 h-4 w-4" />Plan Journalier</>}
            </Button>
            <Button onClick={handleGenerateWeeklyPlan} disabled={isGenerating || !ingredientValidation.canGenerateWeekly || regenerationBlocked || planState.isBlocked} variant={planState.isDraft ? "outline" : "default"}>
              {isGeneratingWeekly ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Génération...</> : <><Calendar className="mr-2 h-4 w-4" />{planState.isDraft ? 'Régénérer' : 'Plan Hebdomadaire'}</>}
            </Button>
            {planState.isDraft && <DiscardDraftButton onDiscard={handleDiscardDraft} disabled={planState.isSaving} />}
            <LockPlanButton canLock={planState.canLock} isLocking={planState.isSaving} onLock={handleLockPlan} disabled={!ingredientValidation.canGenerateWeekly || planState.isBlocked} />
          </div>
        </div>
      </Card>

      {planState.isLoading && (
        <Card className="p-12 shadow-card">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Chargement du plan depuis la base de données...</p>
          </div>
        </Card>
      )}

      {hasWeeklyPlan && !planState.isLoading && <WeeklyMealPlanDisplay weeklyPlan={planState.weeklyPlan!} />}
      {hasDailyPlan && !planState.isLoading && <DailyMealPlanDisplay {...dailyMealPlan} />}

      {!hasAnyPlan && !planState.isLoading && planState.state !== 'ERROR' && (
        <Card className="p-6 shadow-card">
          <div className="text-center py-8">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun plan nutritionnel</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {ingredientValidation.canGenerateWeekly
                ? 'Générez un plan hebdomadaire pour créer un programme nutritionnel personnalisé.'
                : `Sélectionnez au moins ${INGREDIENT_MINIMUMS.weeklyPlan} ingrédients aimés pour générer un plan.`}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
