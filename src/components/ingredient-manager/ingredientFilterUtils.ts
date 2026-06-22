/**
 * Filter utilities for the ingredient list.
 *
 * Pure: takes the search term + selected category and returns the
 * filtered ingredients from the core database. No state, no side
 * effects — extracted from EnhancedIngredientManager so the same
 * predicate can be reused in other views (e.g. the IngredientsPage).
 */

import { useMemo } from "react";
import { coreIngredients, type IngredientData } from "@/data/ingredientDatabase";

export interface IngredientFilterInput {
  searchTerm: string;
  selectedCategory: string;
}

export const CATEGORIES: readonly string[] = [
  'all',
  'protein',
  'carbohydrate',
  'fat',
  'fruit',
  'vegetable',
  'misc',
] as const;

/**
 * Pure filter — case-insensitive search across name and tags, plus an
 * exact category match when selectedCategory !== 'all'.
 */
export function filterIngredients(
  ingredients: readonly IngredientData[],
  { searchTerm, selectedCategory }: IngredientFilterInput
): IngredientData[] {
  const search = searchTerm.toLowerCase();
  return ingredients.filter((ingredient) => {
    const matchesSearch =
      search === '' ||
      ingredient.name.toLowerCase().includes(search) ||
      ingredient.tags.some((tag) => tag.toLowerCase().includes(search));
    const matchesCategory =
      selectedCategory === 'all' || ingredient.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
}

/**
 * Hook form: memoized filter over the core ingredient database. Use in
 * components that already have searchTerm/selectedCategory state.
 */
export function useFilteredIngredients({
  searchTerm,
  selectedCategory,
}: IngredientFilterInput): IngredientData[] {
  return useMemo(
    () => filterIngredients(coreIngredients, { searchTerm, selectedCategory }),
    [searchTerm, selectedCategory]
  );
}
