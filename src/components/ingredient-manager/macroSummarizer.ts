/**
 * Macro summarizer — sums up the macronutrient totals across the
 * client's allowed (non-blocked) ingredients.
 *
 * Extracted from EnhancedIngredientManager.tsx where it was a single
 * useMemo. Now a custom hook with the same signature and output shape.
 *
 * Each ingredient's macros are scaled by its typical serving size
 * (in grams / 100), so the totals reflect a realistic daily intake
 * estimate from the unlocked ingredient pool — not the per-100g
 * numbers alone.
 */

import { useMemo } from "react";
import { coreIngredients } from "@/data/ingredientDatabase";
import type { ClientIngredientRestrictions } from "@/utils/ingredientSubstitution";

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const EMPTY_TOTALS: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

/**
 * Pure: compute totals over the given ingredient pool minus blocked.
 */
export function summarizeMacros(
  restriction: ClientIngredientRestrictions | null
): MacroTotals {
  if (!restriction) return { ...EMPTY_TOTALS };

  const allowedIngredients = coreIngredients.filter(
    (ing) => !restriction.blockedIngredients.includes(ing.id)
  );

  return allowedIngredients.reduce<MacroTotals>((acc, ing) => {
    const servingFactor = ing.typical_serving_size_g / 100;
    return {
      calories: acc.calories + ing.macros.calories * servingFactor,
      protein: acc.protein + ing.macros.protein * servingFactor,
      carbs: acc.carbs + ing.macros.carbs * servingFactor,
      fat: acc.fat + ing.macros.fat * servingFactor,
    };
  }, { ...EMPTY_TOTALS });
}

/**
 * Hook form: memoized totals for the active client. Recomputes only
 * when the restriction reference changes (the restriction object is
 * stable across renders unless it actually mutates).
 */
export function useMacroSummary(
  restriction: ClientIngredientRestrictions | null
): MacroTotals {
  return useMemo(
    () => summarizeMacros(restriction),
    [restriction]
  );
}