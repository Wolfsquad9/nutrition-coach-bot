/**
 * NutritionTabContent - Dedicated component for nutrition tab with Draft → Lock lifecycle
 * 
 * Implements deterministic behavior:
 * - Loads locked plan on mount and client change
 * - Generation creates a DRAFT (not persisted)
 * - Coach can regenerate freely while in DRAFT
 * - Explicit "Lock Plan" button to persist and lock for 7 days
 */

import { useState, useEffect, useCallback } from 'react';
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
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import { DailyMealPlanDisplay } from '@/components/DailyMealPlanDisplay';
import { PlanLockIndicator } from '@/components/DataSourceIndicator';
import { LockPlanButton, DiscardDraftButton } from '@/components/LockPlanButton';
import { getClientLabel } from '@/utils/clientHelpers';
import type { Client } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

interface NutritionTabContentProps {
  activeClientId: string;
  activeClient: Client;
  clientRestrictions: ClientIngredientRestrictions[];
}

// State indicator badge component - updated for Draft → Lock lifecycle
function PlanStateIndicator({ state, lockStatus }: { 
  state: PlanState; 
  lockStatus: { isLocked: boolean; daysRemaining: number };
}) {
  const config: Record<PlanState, { label: string; variant: 'default' | 'secondary' | 'outline'; className: string; icon: React.ReactNode }> = {
    EMPTY: { 
      label: 'Aucun plan', 
      variant: 'outline', 
      className: 'text-muted-foreground border-muted',
      icon: <CloudOff className="w-3 h-3 mr-1" />
    },
    DRAFT: { 
      label: 'Brouillon', 
      variant: 'secondary', 
      className: 'bg-warning/20 text-warning border-warning/30',
      icon: <FileEdit className="w-3 h-3 mr-1" />
    },
    LOCKED: { 
      label: lockStatus.isLocked 
        ? `Verrouillé (${lockStatus.daysRemaining}j)` 
        : 'Enregistré',
      variant: 'default', 
      className: lockStatus.isLocked
        ? 'bg-info/20 text-info border-info/30'
        : 'bg-success/20 text-success border-success/30',
      icon: lockStatus.isLocked 
        ? <Lock className="w-3 h-3 mr-1" /> 
        : <Database className="w-3 h-3 mr-1" />
    },
    EXPIRED: { 
      label: 'Verrou expiré', 
      variant: 'default', 
      className: 'bg-success/20 text-success border-success/30',
      icon: <Unlock className="w-3 h-3 mr-1" />
    },
    LOADING: { 
      label: 'Chargement...', 
      variant: 'outline', 
      className: 'text-muted-foreground animate-pulse',
      icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />
    },
    SAVING: { 
      label: 'Verrouillage...', 
      variant: 'outline', 
      className: 'text-primary animate-pulse',
      icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />
    },
    ERROR: { 
      label: 'Erreur', 
      variant: 'secondary', 
      className: 'bg-destructive/20 text-destructive border-destructive/30',
      icon: <AlertCircle className="w-3 h-3 mr-1" />
    },
  };

  const { label, variant, className, icon } = config[state];

  return (
    <Badge variant={variant} className={className}>
      {icon}
      {label}
    </Badge>
  );
}

export function NutritionTabContent({ 
  activeClientId, 
  activeClient,
  clientRestrictions 
}: NutritionTabContentProps) {
  const { toast } = useToast();
  
  // Plan state machine (Draft → Lock lifecycle)
  const planState = useNutritionPlanState();
  
  // Ingredient validation
  const ingredientValidation = useIngredientValidation(activeClientId, clientRestrictions);
  
  // Local state for daily plan (not persisted)
  const [dailyMealPlan, setDailyMealPlan] = useState<FullDayMealPlanResult | null>(null);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);

  // Load plan when client changes
  useEffect(() => {
    if (activeClientId) {
      planState.loadPlanForClient(activeClientId);
      setDailyMealPlan(null);
    }
  }, [activeClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get liked foods from restrictions
  const getLikedFoods = useCallback((): string[] => {
    const restriction = clientRestrictions.find(r => r.clientId === activeClientId);
    return restriction?.preferredIngredients || [];
  }, [activeClientId, clientRestrictions]);

  // Handle daily plan generation
  const handleGenerateDailyPlan = async () => {
    if (planState.isBlocked) {
      toast({
        title: 'Opération bloquée',
        description: 'Une erreur précédente doit être résolue. Cliquez sur "Réessayer" ou rechargez la page.',
        variant: 'destructive',
      });
      return;
    }

    const validation = ingredientValidation.validateForPlanType('daily');
    if (!validation.valid) {
      toast({
        title: 'Ingrédients insuffisants',
        description: validation.message,
        variant: 'destructive',
      });
      return;
    }

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

      toast({
        title: 'Plan journalier généré !',
        description: `${result.totalMacros.calories} kcal`,
      });
    } catch (err: any) {
      console.error('Error generating daily plan:', err);
      toast({
        title: 'Erreur',
        description: err.message || 'Impossible de générer le plan journalier',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  // Handle weekly plan generation - creates DRAFT (not persisted)
  const handleGenerateWeeklyPlan = async () => {
    if (planState.isBlocked) {
      toast({
        title: 'Opération bloquée',
        description: 'Une erreur précédente doit être résolue. Cliquez sur "Réessayer" ou rechargez la page.',
        variant: 'destructive',
      });
      return;
    }

    // Check if plan is locked and lock hasn't expired
    if (planState.isLocked && planState.lockStatus.isLocked) {
      toast({
        title: 'Plan verrouillé',
        description: `Le plan actuel est verrouillé pour ${planState.lockStatus.daysRemaining} jour(s). Utilisez les suggestions pour demander des modifications.`,
        variant: 'destructive',
      });
      return;
    }

    // Validate ingredients
    const validation = ingredientValidation.validateForPlanType('weekly');
    if (!validation.valid) {
      toast({
        title: 'Ingrédients insuffisants',
        description: validation.message,
        variant: 'destructive',
      });
      return;
    }

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

      // Generate plan locally
      const weeklyPlan = generateWeeklyMealPlan(likedFoods, macroTargets);

      // Set as DRAFT (NOT persisted to DB)
      planState.setDraftPlan(weeklyPlan, macroTargets, likedFoods);

      toast({
        title: 'Brouillon généré !',
        description: 'Le plan est en mode brouillon. Cliquez sur "Verrouiller le Plan" pour l\'enregistrer.',
      });
    } catch (err: any) {
      console.error('Error generating weekly plan:', err);
      toast({
        title: 'Erreur',
        description: err.message || 'Impossible de générer le plan hebdomadaire',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingWeekly(false);
    }
  };

  // Handle locking the plan (persists to DB)
  const handleLockPlan = async () => {
    const result = await planState.lockPlan(activeClientId);
    
    if (result.success) {
      toast({
        title: 'Plan verrouillé !',
        description: 'Le plan a été enregistré et verrouillé pour 7 jours.',
      });
    } else {
      toast({
        title: 'Échec du verrouillage',
        description: result.error || 'Le plan n\'a pas pu être verrouillé.',
        variant: 'destructive',
      });
    }
  };

  // Handle discarding draft
  const handleDiscardDraft = async () => {
    await planState.discardDraft(activeClientId);
    toast({
      title: 'Brouillon annulé',
      description: 'Le brouillon a été supprimé.',
    });
  };

  // Handle reload from DB
  const handleReloadPlan = () => {
    planState.loadPlanForClient(activeClientId);
    toast({
      title: 'Rechargement',
      description: 'Le plan est rechargé depuis la base de données.',
    });
  };

  const isGenerating = isGeneratingDaily || isGeneratingWeekly;
  const hasWeeklyPlan = !!planState.weeklyPlan;
  const hasDailyPlan = !!dailyMealPlan;
  const hasAnyPlan = hasWeeklyPlan || hasDailyPlan;
  
  // Determine if regeneration is blocked
  const regenerationBlocked = planState.isLocked && planState.lockStatus.isLocked;

  return (
    <div className="space-y-4">
      {/* Client & Status Header */}
      <Card className="p-4 shadow-card bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Client:</span>
            <span className="font-semibold text-foreground">
              {getClientLabel(activeClient)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PlanStateIndicator 
              state={planState.state} 
              lockStatus={planState.lockStatus}
            />
            {(planState.isLocked || planState.state === 'ERROR') && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleReloadPlan}
                disabled={planState.isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${planState.isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Draft Mode Banner */}
      {planState.isDraft && (
        <Alert className="border-warning/50 bg-warning/10">
          <FileEdit className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Mode Brouillon</strong> — Ce plan n'est pas encore enregistré. 
            Vous pouvez le régénérer librement. Cliquez sur "Verrouiller le Plan" pour le sauvegarder.
          </AlertDescription>
        </Alert>
      )}

      {/* Lock Expired Banner */}
      {planState.isLocked && !planState.lockStatus.isLocked && (
        <Alert className="border-success/50 bg-success/10">
          <Unlock className="h-4 w-4 text-success" />
          <AlertDescription className="text-success">
            <strong>Verrou expiré</strong> — Vous pouvez maintenant générer un nouveau plan.
          </AlertDescription>
        </Alert>
      )}

      {/* Ingredient Validation Warning */}
      {!ingredientValidation.canGenerateWeekly && (
        <Alert variant="default" className="border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            {ingredientValidation.validationMessage}
            <span className="ml-2 font-medium">
              ({ingredientValidation.likedCount}/{INGREDIENT_MINIMUMS.weeklyPlan} sélectionnés)
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Error Display with Retry */}
      {planState.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>{planState.error}</span>
            <div className="flex gap-2 ml-4">
              {planState.isBlocked && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    planState.clearError();
                    planState.loadPlanForClient(activeClientId);
                  }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Réessayer
                </Button>
              )}
              <Button 
                variant="link" 
                size="sm" 
                onClick={planState.clearError}
                className="p-0 h-auto text-destructive underline"
              >
                Fermer
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Blocked State Warning */}
      {planState.isBlocked && !planState.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <span>Une erreur précédente bloque les opérations.</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                planState.clearError();
                planState.loadPlanForClient(activeClientId);
              }}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Débloquer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Generation Controls */}
      <Card className="p-6 shadow-card">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
              <CalendarDays className="h-6 w-6" />
              Génération de Plans Repas
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {planState.isDraft 
                ? 'Plan en brouillon. Régénérez ou verrouillez pour enregistrer.'
                : regenerationBlocked
                  ? `Plan verrouillé pour ${planState.lockStatus.daysRemaining} jour(s).`
                  : hasWeeklyPlan 
                    ? 'Plan existant. Générez un nouveau plan pour créer un brouillon.'
                    : 'Générez un plan basé sur les ingrédients préférés du client.'}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* Daily Plan Button */}
            <Button
              onClick={handleGenerateDailyPlan}
              disabled={isGenerating || !ingredientValidation.canGenerateDaily || planState.isBlocked}
              variant="outline"
            >
              {isGeneratingDaily ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Plan Journalier
                </>
              )}
            </Button>

            {/* Weekly Plan Button */}
            <Button
              onClick={handleGenerateWeeklyPlan}
              disabled={
                isGenerating || 
                !ingredientValidation.canGenerateWeekly || 
                regenerationBlocked || 
                planState.isBlocked
              }
              variant={planState.isDraft ? "outline" : "default"}
              className={planState.isDraft ? "" : "bg-gradient-primary text-white shadow-glow hover:shadow-xl"}
            >
              {isGeneratingWeekly ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  {planState.isDraft ? 'Régénérer' : 'Plan Hebdomadaire'}
                </>
              )}
            </Button>

            {/* Discard Draft Button */}
            {planState.isDraft && (
              <DiscardDraftButton 
                onDiscard={handleDiscardDraft}
                disabled={planState.isSaving}
              />
            )}

            {/* Lock Plan Button */}
            <LockPlanButton
              canLock={planState.canLock}
              isLocking={planState.isSaving}
              onLock={handleLockPlan}
              disabled={!ingredientValidation.canGenerateWeekly || planState.isBlocked}
            />
          </div>
        </div>
      </Card>

      {/* Loading State */}
      {planState.isLoading && (
        <Card className="p-12 shadow-card">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Chargement du plan depuis la base de données...</p>
          </div>
        </Card>
      )}

      {/* Weekly Plan Display */}
      {hasWeeklyPlan && !planState.isLoading && (
        <WeeklyMealPlanDisplay weeklyPlan={planState.weeklyPlan!} />
      )}

      {/* Daily Plan Display */}
      {hasDailyPlan && !planState.isLoading && (
        <DailyMealPlanDisplay
          dailyPlan={dailyMealPlan.dailyPlan}
          totalMacros={dailyMealPlan.totalMacros}
          targetMacros={dailyMealPlan.targetMacros}
          variance={dailyMealPlan.variance}
          convergenceInfo={dailyMealPlan.convergenceInfo}
        />
      )}

      {/* Empty State */}
      {!hasAnyPlan && !planState.isLoading && planState.state !== 'ERROR' && (
        <Card className="p-6 shadow-card">
          <div className="text-center py-8">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun plan nutritionnel</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {ingredientValidation.canGenerateWeekly 
                ? 'Générez un plan hebdomadaire pour créer un programme nutritionnel personnalisé.'
                : `Sélectionnez au moins ${INGREDIENT_MINIMUMS.weeklyPlan} ingrédients aimés dans l'onglet Ingrédients pour générer un plan.`}
            </p>
          </div>
        </Card>
      )}

      {/* Plan Metadata (when locked/persisted) */}
      {planState.isLocked && planState.planCreatedAt && (
        <div className="text-xs text-muted-foreground text-center">
          Plan verrouillé le {new Date(planState.planCreatedAt).toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
          {planState.versionId && (
            <span className="ml-2">• Version: {planState.versionId.slice(0, 8)}</span>
          )}
        </div>
      )}

      {/* Draft Mode Indicator */}
      {planState.isDraft && (
        <div className="text-xs text-warning text-center font-medium">
          ⚠️ Brouillon non enregistré — Les modifications seront perdues si vous changez de client
        </div>
      )}
    </div>
  );
}
