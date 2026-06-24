/**
 * Recipe + AI plan action handlers.
 *
 * Extracted from EnhancedIngredientManager.tsx where two handlers
 * (handleGenerateRecipe, generateAIPlan) were defined inline. They
 * are now grouped under a single hook that takes the state the
 * handlers need and returns the same functions.
 *
 * Note: this file also exports the shared `ToastFn` type used by
 * both ingredientExporter.ts and recipeActionHandler.ts to keep the
 * toast surface identical between them.
 */

import { useCallback } from "react";
import { generateRecipe, type GeneratedRecipe, type MealType } from '@/services/recipeService';
import type { Client } from "@/types";
import type { ClientIngredientRestrictions } from "@/utils/ingredientSubstitution";
import { coreIngredients } from "@/data/ingredientDatabase";
import type { GeneratedDietPlan, GeneratedTrainingPlan, PlanType } from "./types";

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
  setIsGeneratingPlan: (next: boolean) => void;
  setGeneratedDietPlan: (next: GeneratedDietPlan | null) => void;
  setGeneratedTrainingPlan: (next: GeneratedTrainingPlan | null) => void;
  toast: ToastFn;
}

export interface UseRecipeActionHandlerResult {
  handleGenerateRecipe: () => Promise<void>;
  generateAIPlan: (planType: PlanType) => Promise<void>;
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
    setIsGeneratingPlan,
    setGeneratedDietPlan,
    setGeneratedTrainingPlan,
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

    setIsGeneratingRecipe(true);

    try {
      // Small delay for UX
      await new Promise((resolve) => setTimeout(resolve, 500));

      const recipe = generateRecipe(preferredIngredients, selectedMealType);
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

  const generateAIPlan = useCallback(
    async (_planType: PlanType) => {
      if (!activeClientId || !activeClient) {
        toast({
          title: 'No client selected',
          description: 'A client must be selected in the Client tab',
          variant: 'destructive',
        });
        return;
      }

      setIsGeneratingPlan(true);

      try {
        const restriction = getClientRestriction(activeClientId);
        const allowedIngredients = coreIngredients.filter(
          (ing) => !restriction.blockedIngredients.includes(ing.id)
        );

        // Mock AI response for demo (replace with actual AI endpoint call)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const mockResponse = {
          dietPlan: {
            totalCalories: 2200,
            macros: { protein: 165, carbs: 220, fat: 73 },
            meals: Array(7).fill(null).map((_, day) => ({
              day: day + 1,
              meals: [
                { name: 'Breakfast', calories: 550, protein: 40, carbs: 55, fat: 18 },
                { name: 'Lunch', calories: 660, protein: 50, carbs: 66, fat: 22 },
                { name: 'Dinner', calories: 660, protein: 50, carbs: 66, fat: 22 },
                { name: 'Snack', calories: 330, protein: 25, carbs: 33, fat: 11 },
              ],
            })),
          },
          trainingPlan: {
            split: 'Push/Pull/Legs',
            sessions: activeClient.trainingDaysPerWeek,
            workouts: Array(activeClient.trainingDaysPerWeek).fill(null).map((_, i) => ({
              day: i + 1,
              name: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Active Recovery'][i],
              exercises: [
                { name: 'Exercise 1', sets: 4, reps: '8-10' },
                { name: 'Exercise 2', sets: 3, reps: '10-12' },
                { name: 'Exercise 3', sets: 3, reps: '12-15' },
              ],
            })),
          },
          shoppingList: [
            { category: 'Protein', items: ['Chicken Breast 1.5kg', 'Eggs 24ct', 'Greek Yogurt 1kg'] },
            { category: 'Carbs', items: ['Rice 2kg', 'Oats 1kg', 'Sweet Potatoes 2kg'] },
            { category: 'Fats', items: ['Olive Oil 500ml', 'Avocado 6ct', 'Almonds 500g'] },
            { category: 'Vegetables', items: ['Broccoli 1kg', 'Spinach 500g', 'Bell Peppers 6ct'] },
          ],
        };

        setGeneratedDietPlan(mockResponse.dietPlan);
        setGeneratedTrainingPlan(mockResponse.trainingPlan);

        toast({
          title: 'Plan generated!',
          description: 'Complete plan generated successfully',
        });
      } catch (error) {
        console.error('AI generation error:', error);
        toast({
          title: 'Generation error',
          description: 'Unable to generate plan',
          variant: 'destructive',
        });
      } finally {
        setIsGeneratingPlan(false);
      }
    },
    [
      activeClientId,
      activeClient,
      getClientRestriction,
      setIsGeneratingPlan,
      setGeneratedDietPlan,
      setGeneratedTrainingPlan,
      toast,
    ]
  );

  return { handleGenerateRecipe, generateAIPlan };
}