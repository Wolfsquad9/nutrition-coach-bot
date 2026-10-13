import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  createEmptyMealData,
  type DailyMealPlan,
  type IngredientData,
  type MealData,
} from '@/data/ingredientDatabase';
import type { Macros } from '@/types';
import type {
  FullDayMealPlanResult,
  GeneratedRecipe,
  WeeklyMealPlanResult,
} from '@/services/recipeService';
import { presentMeal } from './mealArchetypePresentation';
import { GeneratedRecipeCardTitle } from './GeneratedRecipeCardTitle';
import { DailyMealPlanDisplay } from './DailyMealPlanDisplay';
import { WeeklyMealPlanDisplay } from './WeeklyMealPlanDisplay';

// ============================================================================
// Fixtures
// ============================================================================

// Real catalogue entry `overnight-oats`: template 'Overnight {carbohydrate}
// with {protein}' -> the title below, derived with no guessing involved.
const ARCHETYPE_TITLE = 'Overnight Rolled Oats with Greek Yoghurt';
const UNKNOWN_ARCHETYPE_ID = 'ghost-archetype';

const makeIngredient = (
  id: string,
  name: string,
  category: IngredientData['category'],
): IngredientData => ({
  id,
  name,
  category,
  macros: { protein: 0, carbs: 0, fat: 0, calories: 0 },
  allowedMeals: ['breakfast', 'lunch', 'dinner', 'snack'],
  typical_serving_size_g: 100,
  tags: [],
});

const OATS = makeIngredient('oats', 'Rolled Oats', 'carbohydrate');
const GREEK_YOGHURT = makeIngredient('greek-yoghurt', 'Greek Yoghurt', 'protein');
const ALMONDS = makeIngredient('almonds', 'Almonds', 'fat');

// Mirrors generateMealRecipeText/generateFinalRecipeText: the legacy recipe
// name is embedded as the first bold line of recipeText.
const LEGACY_EMBEDDED_NAME = '**Yogurt Power Bowl with Oats**';
const RECIPE_TEXT = `${LEGACY_EMBEDDED_NAME}\n\nMacros: 300 kcal\n\n**Ingredients:**\n- Rolled Oats: 100g\n\n**Preparation:**\n1. Combine and refrigerate overnight.`;

const MEAL_MACROS = { protein: 20, carbs: 40, fat: 10, calories: 300 };
const TOTAL_MACROS: Macros = { calories: 300, protein: 20, carbs: 40, fat: 10, fiber: 5 };
const TARGET_MACROS = { calories: 300, protein: 20, carbs: 40, fat: 10 };
const ZERO_VARIANCE = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function makeMeal(archetypeId?: string): MealData {
  return {
    ingredients: [OATS, GREEK_YOGHURT, ALMONDS],
    recipeText: RECIPE_TEXT,
    macros: MEAL_MACROS,
    ...(archetypeId ? { archetypeId } : {}),
  };
}

const ARCHETYPE_MEAL = makeMeal('overnight-oats');
const LEGACY_MEAL = makeMeal();
const UNKNOWN_MEAL = makeMeal(UNKNOWN_ARCHETYPE_ID);

function makeDailyPlan(breakfast: MealData): DailyMealPlan {
  return {
    breakfast,
    lunch: createEmptyMealData(),
    dinner: createEmptyMealData(),
    snack: createEmptyMealData(),
  };
}

function makeFullDay(breakfast: MealData): FullDayMealPlanResult {
  return {
    dailyPlan: makeDailyPlan(breakfast),
    totalMacros: TOTAL_MACROS,
    targetMacros: TARGET_MACROS,
    variance: ZERO_VARIANCE,
  };
}

function makeWeeklyPlan(breakfast: MealData): WeeklyMealPlanResult {
  return {
    days: [{ dayNumber: 1, dayName: 'Monday', plan: makeFullDay(breakfast) }],
    weeklyTotalMacros: TOTAL_MACROS,
    weeklyTargetMacros: TARGET_MACROS,
    weeklyVariance: ZERO_VARIANCE,
  };
}

const CARD_RECIPE_NAME = 'Zesty Harvest Medley';

function makeRecipe(archetypeId?: string): GeneratedRecipe {
  return {
    id: 'recipe-test-1',
    name: CARD_RECIPE_NAME,
    category: 'breakfast',
    prepTime: 5,
    cookTime: 10,
    servings: 1,
    ingredients: [],
    instructions: ['Combine the ingredients.'],
    macrosPerServing: { calories: 300, protein: 20, carbs: 40, fat: 10, fiber: 5 },
    tags: [],
    dietTypes: [],
    allergens: [],
    equipment: [],
    difficulty: 'easy',
    suitableFor: 'breakfast',
    selectedIngredients: [OATS, GREEK_YOGHURT, ALMONDS],
    ...(archetypeId ? { archetypeId } : {}),
  };
}

/** Weekly meal sections start collapsed; expand breakfast before asserting. */
function openBreakfastSection() {
  fireEvent.click(screen.getByRole('button', { name: /Breakfast/ }));
}

// ============================================================================
// presentMeal — the shared pure presentation rule
// ============================================================================

describe('presentMeal — shared archetype presentation rule', () => {
  it('known archetype: resolves the catalogue title and strips the embedded legacy name', () => {
    const result = presentMeal(ARCHETYPE_MEAL);
    expect(result.kind).toBe('resolved');
    expect(result.title).toBe(ARCHETYPE_TITLE);
    expect(result.recipeText).not.toContain('Power Bowl');
    // Body content survives untouched.
    expect(result.recipeText).toContain('Macros: 300 kcal');
    expect(result.recipeText).toContain('**Ingredients:**');
  });

  it('legacy meal (no archetypeId): no title, recipeText untouched', () => {
    const result = presentMeal(LEGACY_MEAL);
    expect(result.kind).toBe('legacy');
    expect(result.title).toBeNull();
    expect(result.recipeText).toBe(RECIPE_TEXT);
  });

  it('unknown archetype id: no throw, no fabricated title, recipeText untouched', () => {
    const result = presentMeal(UNKNOWN_MEAL);
    expect(result.kind).toBe('unknown');
    expect(result.title).toBeNull();
    expect(result.recipeText).toBe(RECIPE_TEXT);
  });

  it('does not mutate the input meal or its ingredients', () => {
    const before = JSON.parse(JSON.stringify(ARCHETYPE_MEAL));
    presentMeal(ARCHETYPE_MEAL);
    expect(JSON.parse(JSON.stringify(ARCHETYPE_MEAL))).toEqual(before);
  });

  it('is deterministic: same input, same output', () => {
    expect(presentMeal(ARCHETYPE_MEAL)).toEqual(presentMeal(ARCHETYPE_MEAL));
    expect(presentMeal(UNKNOWN_MEAL)).toEqual(presentMeal(UNKNOWN_MEAL));
  });
});

// ============================================================================
// Recipe card heading
// ============================================================================

describe('GeneratedRecipeCardTitle — recipe card heading', () => {
  it('known archetype: shows the resolved title, not the legacy recipe name', () => {
    render(<GeneratedRecipeCardTitle recipe={makeRecipe('overnight-oats')} />);
    expect(screen.getByRole('heading', { name: ARCHETYPE_TITLE })).toBeInTheDocument();
    // Exactly one name: the legacy name must not compete with the title.
    expect(screen.queryByText(CARD_RECIPE_NAME)).toBeNull();
  });

  it('legacy recipe: renders the recipe name exactly as before', () => {
    render(<GeneratedRecipeCardTitle recipe={makeRecipe()} />);
    expect(screen.getByRole('heading', { name: CARD_RECIPE_NAME })).toBeInTheDocument();
  });

  it('unknown archetype: falls back to the recipe name — no fabricated title, no raw id', () => {
    render(<GeneratedRecipeCardTitle recipe={makeRecipe(UNKNOWN_ARCHETYPE_ID)} />);
    expect(screen.getByRole('heading', { name: CARD_RECIPE_NAME })).toBeInTheDocument();
    expect(screen.queryByText(UNKNOWN_ARCHETYPE_ID)).toBeNull();
    expect(screen.queryByText(ARCHETYPE_TITLE)).toBeNull();
  });
});

// ============================================================================
// DailyMealPlanDisplay
// ============================================================================

describe('DailyMealPlanDisplay', () => {
  it('known archetype: renders the archetype title heading without the embedded legacy name', () => {
    render(<DailyMealPlanDisplay {...makeFullDay(ARCHETYPE_MEAL)} />);
    expect(screen.getByRole('heading', { name: ARCHETYPE_TITLE })).toBeInTheDocument();
    expect(screen.queryByText(/Power Bowl/)).toBeNull();
    // Meal label and ingredient content stay intact.
    expect(screen.getByRole('heading', { name: 'Breakfast' })).toBeInTheDocument();
    expect(screen.getByText('Rolled Oats')).toBeInTheDocument();
    expect(screen.getByText(/Macros: 300 kcal/)).toBeInTheDocument();
  });

  it('legacy recipe: renders as before — full text, no archetype heading', () => {
    render(<DailyMealPlanDisplay {...makeFullDay(LEGACY_MEAL)} />);
    expect(screen.queryByRole('heading', { name: ARCHETYPE_TITLE })).toBeNull();
    const embedded = screen.getAllByText(/Power Bowl/);
    expect(embedded).toHaveLength(1);
    expect(embedded[0].textContent).toBe(RECIPE_TEXT);
  });

  it('unknown archetype: renders safely — no invented title, no raw id exposed', () => {
    render(<DailyMealPlanDisplay {...makeFullDay(UNKNOWN_MEAL)} />);
    expect(screen.queryByRole('heading', { name: ARCHETYPE_TITLE })).toBeNull();
    expect(screen.queryByText(UNKNOWN_ARCHETYPE_ID)).toBeNull();
    const embedded = screen.getAllByText(/Power Bowl/);
    expect(embedded).toHaveLength(1);
    expect(embedded[0].textContent).toBe(RECIPE_TEXT);
  });
});

// ============================================================================
// WeeklyMealPlanDisplay (screen copy + embedded printable copy)
// ============================================================================

describe('WeeklyMealPlanDisplay', () => {
  it('known archetype: title in the opened section and the print copy; embedded name gone', () => {
    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(ARCHETYPE_MEAL)} />);
    openBreakfastSection();
    const titles = screen.getAllByRole('heading', { name: ARCHETYPE_TITLE });
    expect(titles.length).toBeGreaterThanOrEqual(2); // screen section + print copy
    for (const el of titles) expect(el.textContent).toBe(ARCHETYPE_TITLE);
    expect(screen.queryByText(/Power Bowl/)).toBeNull();
  });

  it('legacy recipe: unchanged — "Recipe:" labels, embedded name intact, no archetype title', () => {
    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(LEGACY_MEAL)} />);
    openBreakfastSection();
    expect(screen.queryAllByRole('heading', { name: ARCHETYPE_TITLE })).toHaveLength(0);
    const embedded = screen.getAllByText(/Power Bowl/);
    expect(embedded.length).toBeGreaterThanOrEqual(2); // screen section + print copy
    for (const el of embedded) expect(el.textContent).toBe(RECIPE_TEXT);
    expect(
      screen.getAllByRole('heading', { name: 'Recipe:' }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('unknown archetype: renders safely — no invented title, no raw id exposed', () => {
    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(UNKNOWN_MEAL)} />);
    openBreakfastSection();
    expect(screen.queryAllByRole('heading', { name: ARCHETYPE_TITLE })).toHaveLength(0);
    expect(screen.queryByText(UNKNOWN_ARCHETYPE_ID)).toBeNull();
    expect(screen.getAllByText(/Power Bowl/).length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Daily and weekly views stay consistent with each other
// ============================================================================

describe('daily and weekly views render consistently', () => {
  it('known archetype: both views show the same title and no embedded legacy name', () => {
    const daily = render(<DailyMealPlanDisplay {...makeFullDay(ARCHETYPE_MEAL)} />);
    expect(screen.getAllByRole('heading', { name: ARCHETYPE_TITLE })).toHaveLength(1);
    expect(screen.queryByText(/Power Bowl/)).toBeNull();
    daily.unmount();

    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(ARCHETYPE_MEAL)} />);
    openBreakfastSection();
    expect(
      screen.getAllByRole('heading', { name: ARCHETYPE_TITLE }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Power Bowl/)).toBeNull();
  });

  it('legacy: neither view adds an archetype heading', () => {
    const daily = render(<DailyMealPlanDisplay {...makeFullDay(LEGACY_MEAL)} />);
    expect(screen.queryByRole('heading', { name: ARCHETYPE_TITLE })).toBeNull();
    daily.unmount();

    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(LEGACY_MEAL)} />);
    openBreakfastSection();
    expect(screen.queryAllByRole('heading', { name: ARCHETYPE_TITLE })).toHaveLength(0);
  });

  it('unknown: neither view invents a title or exposes the raw id', () => {
    const daily = render(<DailyMealPlanDisplay {...makeFullDay(UNKNOWN_MEAL)} />);
    expect(screen.queryByRole('heading', { name: ARCHETYPE_TITLE })).toBeNull();
    expect(screen.queryByText(UNKNOWN_ARCHETYPE_ID)).toBeNull();
    daily.unmount();

    render(<WeeklyMealPlanDisplay weeklyPlan={makeWeeklyPlan(UNKNOWN_MEAL)} />);
    openBreakfastSection();
    expect(screen.queryAllByRole('heading', { name: ARCHETYPE_TITLE })).toHaveLength(0);
    expect(screen.queryByText(UNKNOWN_ARCHETYPE_ID)).toBeNull();
  });
});