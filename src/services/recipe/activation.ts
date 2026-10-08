import type { IngredientData } from '@/data/ingredientDatabase';
import type { DietType } from './eligibility';
import type { RecipeGenerationOptions } from './types';

/**
 * Phase 4 — the SINGLE activation point for archetype generation.
 *
 * Every production generation path (daily plan, weekly/optimizer candidates)
 * builds its `RecipeGenerationOptions` through `buildRecipeGenerationOptions`.
 * There are deliberately no `archetypeGeneration: true` literals anywhere else
 * in the app, so activation is switched (or rolled back) by editing
 * `RECIPE_ACTIVATION.archetypeGeneration` alone.
 *
 * This is configuration only. It deliberately does NOT create the eligibility
 * allow-list: `allowedIngredientIds` is always supplied by the caller, which
 * gets it from `resolveEligibleIngredients()` — the Phase 1 single source of
 * truth. Activation therefore cannot widen the eligible ingredient pool; it
 * only changes how a meal's *structure* is chosen within that pool.
 */
export interface RecipeActivationConfig {
  /**
   * Master switch for the Phase 3 archetype pipeline.
   *
   * `false` restores the pre-Phase-4 production behaviour exactly: the legacy
   * balanced selector runs and its output is byte-for-byte unchanged.
   */
  archetypeGeneration: boolean;
}

/** The one place the flag is defined. Flipping this value is the rollback. */
export const RECIPE_ACTIVATION: RecipeActivationConfig = {
  archetypeGeneration: true,
};

export interface BuildGenerationOptionsInput {
  /** HARD eligibility allow-list from `resolveEligibleIngredients()`. */
  allowedIngredientIds: readonly string[];
  /** Client diet, used only to filter archetypes. Never widens eligibility. */
  dietType?: DietType | null;
  /** Escape hatch for tests/tools; defaults to `RECIPE_ACTIVATION`. */
  activation?: RecipeActivationConfig;
}

/**
 * Build the options object every production generation call site passes on.
 *
 * The returned object always carries the caller's `allowedIngredientIds`
 * verbatim, in both the activated and disabled cases, so eligibility is
 * identical whether or not archetypes are enabled.
 */
export function buildRecipeGenerationOptions(
  input: BuildGenerationOptionsInput
): RecipeGenerationOptions {
  const activation = input.activation ?? RECIPE_ACTIVATION;

  return {
    allowedIngredientIds: input.allowedIngredientIds,
    archetypeGeneration: activation.archetypeGeneration,
    dietType: input.dietType ?? null,
  };
}

/**
 * Fallback-eligible pool check.
 *
 * With archetypes enabled, a meal whose eligible pool cannot satisfy ANY
 * archetype's required roles would previously throw and surface as an empty
 * production meal. Rather than partially filling an archetype or inventing a
 * different structure, `generateRecipe` degrades to the legacy balanced
 * selector over the SAME pool. This helper reports whether that degradation is
 * possible at all — i.e. whether the legacy selector could return anything.
 *
 * Used for diagnostics and tests only; it performs no selection.
 */
export function canFallBackToLegacy(pool: readonly IngredientData[]): boolean {
  return pool.length > 0;
}