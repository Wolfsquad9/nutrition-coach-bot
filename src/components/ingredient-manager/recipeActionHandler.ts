/**
 * Recipe action handler.
 *
 * Extracted from EnhancedIngredientManager.tsx where the recipe generator
 * was defined inline. Now grouped under a single hook that takes the state
 * the handler needs and returns the same functions.
 *
 * Note: this file also exports the shared `ToastFn` type used by both
 * ingredientExporter.ts and recipeActionHandler.ts to keep the toast
 * surface identical between them.
 */

import { useCallback } from "react";
import { generateRecipe, resolveEligibleIngredients, buildRecipeGenerationOptions, type GeneratedRecipe, type MealType } from '@/services/recipeService';
import type { Client } from "@/types";
import type { ClientIngredientRestrictions } from "@/utils/ingredientSubstitution";
import type { GeneratedDietPlan } from "./types";

export interface ToastOptions {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}
export type ToastFn = (options: ToastOptions) => void;

export interface UseRecipeActionHandlerArgs {
  activeClientId: string | null;
  activeClient: Client | null;
  getClientRestriction: (clientId: string | null) => ClientIngredientRestrictions;
  selectedMealType: MealType;
  setIsGeneratingRecipe: (next: boolean) => void;
  setGeneratedRecipe: (next: GeneratedRecipe | null) => void;
  setGeneratedDietPlan: (next: GeneratedDietPlan | null) => void;
  toast: ToastFn;
}

export interface UseRecipeActionHandlerResult {
  handleGenerateRecipe: () => Promise<void>;
}

export function useRecipeActionHandler(
  args: UseRecipeActionHandlerArgs
): UseRecipeActionHandlerResult {
  const {
    activeClientId,
    activeClient,
    getClientRestriction,
    selectedMealType,
    setIsGeneratingRecipe,
    setGeneratedRecipe,
    setGeneratedDietPlan,
    toast,
  } = args;

  const handleGenerateRecipe = useCallback(async () => {
    if (!activeClientId || !activeClient) {
      toast({
        title: 'No client selected',
        description: 'A client must be selected in the Client tab',
        variant: 'destructive',
      });
      return;
    }

    const restriction = getClientRestriction(activeClientId);
    const preferredIngredients = restriction.preferredIngredients;

    if (preferredIngredients.length === 0) {
      toast({
        title: 'No ingredients selected',
        description: "First mark ingredients as 'liked' (green star)",
        variant: 'destructive',
      });
      return;
    }

    // Eligibility boundary: the preview must use the same pool as full plan
    // generation, so blocked/allergen/diet exclusions can never be bypassed by
    // this code path.
    const eligibility = resolveEligibleIngredients({
      clientId: activeClientId,
      preferredIngredientIds: preferredIngredients,
      blockedIngredientIds: restriction.blockedIngredients,
      allergies: activeClient.allergies,
      intolerances: activeClient.intolerances,
      dislikedFoods: activeClient.dislikedFoods,
      dietType: activeClient.dietType,
    });

    if (eligibility.ingredientIds.length === 0) {
      toast({
        title: 'No eligible ingredients',
        description:
          eligibility.warnings[0] ??
          'Every liked ingredient was excluded by a restriction. Review this client\u2019s blocked ingredients, allergies and diet.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingRecipe(true);

    try {
      // Small delay for UX
      await new Promise((resolve) => setTimeout(resolve, 500));

      const recipe = generateRecipe(
        [...eligibility.ingredientIds],
        selectedMealType,
        undefined,
        // Same single activation point as plan generation, so the preview and
        // the generated plan can never disagree about which generator is live.
        buildRecipeGenerationOptions({
          allowedIngredientIds: eligibility.ingredientIds,
          dietType: activeClient.dietType,
        }),
      );
      setGeneratedRecipe(recipe);

      toast({
        title: 'Recipe generated!',
        description: `${recipe.name} created successfully`,
      });
    } catch (error) {
      console.error('Recipe generation error:', error);
      toast({
        title: 'Generation error',
        description: error instanceof Error ? error.message : 'Unable to generate recipe',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingRecipe(false);
    }
  }, [
    activeClientId,
    activeClient,
    getClientRestriction,
    selectedMealType,
    setIsGeneratingRecipe,
    setGeneratedRecipe,
    toast,
  ]);

  return { handleGenerateRecipe };
}