/**
 * UI-side archetype presentation rules for meal-plan views.
 *
 * `presentMeal` adapts `MealData` to the resolver's structural input and then
 * applies the single presentation rule shared by every meal renderer
 * (DailyMealPlanDisplay, WeeklyMealPlanDisplay, PrintableMealPlan):
 *
 *  - archetype known:  the catalogue-derived title becomes the recipe heading,
 *    and the legacy recipe name embedded in `recipeText`'s first bold line is
 *    stripped so a meal never shows two (possibly contradictory) names.
 *  - legacy / unknown: `recipeText` and headings stay exactly as they were.
 *    An unknown id never produces a fabricated title, and its raw id is not
 *    exposed in the UI (the resolver keeps it for diagnostics only).
 *
 * Pure and deterministic: no RNG, no clock, no side effects, and no mutation
 * of `meal` or of the archetype catalogue.
 */
import type { MealData } from '@/data/ingredientDatabase';
import {
  ARCHETYPES_BY_ID,
  resolveArchetypePresentation,
  type ArchetypePresentationResult,
} from '@/services/recipeService';

export interface MealRecipePresentation {
  /** The resolver's raw outcome (`resolved` | `legacy` | `unknown`). */
  kind: ArchetypePresentationResult['kind'];
  /** Heading to show above the recipe text; `null` = keep legacy rendering. */
  title: string | null;
  /** Recipe text ready to render (embedded legacy name stripped iff title shown). */
  recipeText: string;
}

export function presentMeal(meal: MealData): MealRecipePresentation {
  const result = resolveArchetypePresentation(
    { archetypeId: meal.archetypeId, selectedIngredients: meal.ingredients },
    ARCHETYPES_BY_ID,
  );

  if (result.kind !== 'resolved') {
    // Legacy AND unknown: render exactly as before.
    return { kind: result.kind, title: null, recipeText: meal.recipeText };
  }

  return {
    kind: 'resolved',
    title: result.presentation.title,
    recipeText: stripEmbeddedRecipeName(meal.recipeText),
  };
}

/** `**Recipe Name**\n...` -> `...` — the embedded name a heading now replaces. */
const EMBEDDED_RECIPE_NAME_LINE = /^\*\*[^*\n]+\*\*\r?\n+/;

function stripEmbeddedRecipeName(recipeText: string): string {
  return recipeText.replace(EMBEDDED_RECIPE_NAME_LINE, '');
}