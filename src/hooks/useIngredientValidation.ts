/**
 * useIngredientValidation - Consistent ingredient validation
 * 
 * Enforces ingredient minimum requirements:
 * - Before generation
 * - After reload
 * - After client switch
 * 
 * Validation is always computed from the current state, never cached.
 */

import { useMemo, useCallback } from 'react';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';
import { MIN_LIKED_INGREDIENTS } from '@/domain/shared/constants';

// Configuration constants - derived from domain
export const INGREDIENT_MINIMUMS = {
  dailyPlan: 3,    // Minimum for daily plan generation
  weeklyPlan: MIN_LIKED_INGREDIENTS,   // Minimum for weekly plan generation (requires more variety)
} as const;

export interface IngredientValidationResult {
  // Current count of liked ingredients
  likedCount: number;
  
  // Can generate daily plan?
  canGenerateDaily: boolean;
  dailyMinimum: number;
  dailyShortfall: number;
  
  // Can generate weekly plan?
  canGenerateWeekly: boolean;
  weeklyMinimum: number;
  weeklyShortfall: number;
  
  // Validation message (if any)
  validationMessage: string | null;
  
  // Has any ingredients selected?
  hasIngredients: boolean;
}

export interface UseIngredientValidationResult extends IngredientValidationResult {
  // Validate and get user-friendly error message
  validateForPlanType: (planType: 'daily' | 'weekly') => { valid: boolean; message: string | null };
}

/**
 * Get liked ingredients for a specific client from restrictions
 */
function getLikedIngredientsForClient(
  clientId: string | null,
  restrictions: ClientIngredientRestrictions[]
): string[] {
  if (!clientId) return [];
  const restriction = restrictions.find(r => r.clientId === clientId);
  return restriction?.preferredIngredients || [];
}

/**
 * Hook for ingredient validation
 */
export function useIngredientValidation(
  activeClientId: string | null,
  clientRestrictions: ClientIngredientRestrictions[]
): UseIngredientValidationResult {
  
  // Compute validation from current state (never cached separately)
  const validation = useMemo((): IngredientValidationResult => {
    const likedIngredients = getLikedIngredientsForClient(activeClientId, clientRestrictions);
    const likedCount = likedIngredients.length;
    
    const canGenerateDaily = likedCount >= INGREDIENT_MINIMUMS.dailyPlan;
    const canGenerateWeekly = likedCount >= INGREDIENT_MINIMUMS.weeklyPlan;
    
    const dailyShortfall = Math.max(0, INGREDIENT_MINIMUMS.dailyPlan - likedCount);
    const weeklyShortfall = Math.max(0, INGREDIENT_MINIMUMS.weeklyPlan - likedCount);
    
    let validationMessage: string | null = null;
    if (!canGenerateWeekly && likedCount > 0) {
      validationMessage = `Sélectionnez ${weeklyShortfall} ingrédient(s) de plus pour générer un plan hebdomadaire (minimum: ${INGREDIENT_MINIMUMS.weeklyPlan})`;
    } else if (likedCount === 0) {
      validationMessage = `Sélectionnez au moins ${INGREDIENT_MINIMUMS.weeklyPlan} ingrédients aimés dans l'onglet Ingrédients`;
    }
    
    return {
      likedCount,
      canGenerateDaily,
      dailyMinimum: INGREDIENT_MINIMUMS.dailyPlan,
      dailyShortfall,
      canGenerateWeekly,
      weeklyMinimum: INGREDIENT_MINIMUMS.weeklyPlan,
      weeklyShortfall,
      validationMessage,
      hasIngredients: likedCount > 0,
    };
  }, [activeClientId, clientRestrictions]);

  /**
   * Validate for a specific plan type and return user-friendly message
   */
  const validateForPlanType = useCallback((planType: 'daily' | 'weekly'): { valid: boolean; message: string | null } => {
    const likedIngredients = getLikedIngredientsForClient(activeClientId, clientRestrictions);
    const likedCount = likedIngredients.length;
    const minimum = planType === 'daily' ? INGREDIENT_MINIMUMS.dailyPlan : INGREDIENT_MINIMUMS.weeklyPlan;
    
    if (likedCount < minimum) {
      const shortfall = minimum - likedCount;
      return {
        valid: false,
        message: `Sélectionnez au moins ${minimum} ingrédients aimés dans l'onglet Ingrédients (${shortfall} de plus requis)`,
      };
    }
    
    return { valid: true, message: null };
  }, [activeClientId, clientRestrictions]);

  return {
    ...validation,
    validateForPlanType,
  };
}

/**
 * Standalone function for validation (for use outside React components)
 */
export function validateIngredients(
  likedIngredients: string[],
  planType: 'daily' | 'weekly'
): { valid: boolean; message: string | null } {
  const minimum = planType === 'daily' ? INGREDIENT_MINIMUMS.dailyPlan : INGREDIENT_MINIMUMS.weeklyPlan;
  const likedCount = likedIngredients.length;
  
  if (likedCount < minimum) {
    const shortfall = minimum - likedCount;
    return {
      valid: false,
      message: `Sélectionnez au moins ${minimum} ingrédients aimés (${shortfall} de plus requis)`,
    };
  }
  
  return { valid: true, message: null };
}
