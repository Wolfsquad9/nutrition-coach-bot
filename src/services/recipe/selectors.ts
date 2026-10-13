import { type IngredientData } from '@/data/ingredientDatabase';
import { type Rng } from '@/utils/random';
import { type MealType } from './constants';

/**
 * Phase 5 3A — SOFT cross-day ingredient-diversity helpers.
 *
 * `weekUsedIngredientIds` (when provided and non-empty) means "this ingredient
 * was already used on an earlier day of the current weekly generation". The
 * helpers below only REORDER or RESTRICT a pick inside the candidate list they
 * are given; they never add a candidate, and when every candidate is marked
 * used they return the original list — the graceful-repetition path. The
 * candidate list itself always comes from the same upstream eligible pool
 * (`allowedIngredientIds ∩ meal-slot`, plus the archetype diet filter), so this
 * preference can never override eligibility or dietary restrictions, and it
 * performs no nutrition maths — nutrition validity stays with the canonical
 * engine downstream, which keeps precedence untouched.
 *
 * An absent or empty set returns the input list unchanged, preserving the
 * pre-Phase-5 selection behaviour (including rng consumption) exactly.
 */

/**
 * Split candidates into (unused, used) w.r.t. the week's soft preference.
 * Without a set everything lands in `fresh`, making both helpers identity.
 */
function splitByWeekUse(
  candidates: IngredientData[],
  weekUsedIngredientIds: ReadonlySet<string> | undefined
): { fresh: IngredientData[]; used: IngredientData[] } {
  if (!weekUsedIngredientIds || weekUsedIngredientIds.size === 0) {
    return { fresh: candidates, used: [] };
  }
  const fresh: IngredientData[] = [];
  const used: IngredientData[] = [];
  for (const candidate of candidates) {
    if (weekUsedIngredientIds.has(candidate.id)) used.push(candidate);
    else fresh.push(candidate);
  }
  return { fresh, used };
}

/**
 * Candidate list for a SINGLE pick: unused candidates when at least one
 * exists, otherwise the full original list (graceful repetition).
 */
export function preferUnusedPick(
  candidates: IngredientData[],
  weekUsedIngredientIds: ReadonlySet<string> | undefined
): IngredientData[] {
  const { fresh, used } = splitByWeekUse(candidates, weekUsedIngredientIds);
  return fresh.length > 0 ? fresh : [...fresh, ...used];
}

/**
 * Candidate ordering for a MULTI pick (a role/slot needing several distinct
 * ingredients): unused candidates hoisted to the front, used ones kept behind
 * so the requested count can always be filled to its full length — repetition
 * is preferred away, never banned.
 */
export function preferUnusedOrdered(
  candidates: IngredientData[],
  weekUsedIngredientIds: ReadonlySet<string> | undefined
): IngredientData[] {
  const { fresh, used } = splitByWeekUse(candidates, weekUsedIngredientIds);
  return [...fresh, ...used];
}

export function selectBalancedIngredients(
  suitableIngredients: IngredientData[],
  mealType: MealType,
  rng: Rng,
  weekUsedIngredientIds?: ReadonlySet<string>
): IngredientData[] {
  const selected: IngredientData[] = [];

  // Must have protein
  const proteins = preferUnusedPick(
    suitableIngredients.filter(ing => ing.category === 'protein'),
    weekUsedIngredientIds
  );
  if (proteins.length > 0) {
    selected.push(proteins[rng.int(proteins.length)]);
  }

  // Add carb for main meals
  if (mealType !== 'snack') {
    const carbs = preferUnusedPick(
      suitableIngredients.filter(ing => ing.category === 'carbohydrate'),
      weekUsedIngredientIds
    );
    if (carbs.length > 0) {
      selected.push(carbs[rng.int(carbs.length)]);
    }
  }

  // Add vegetable for lunch/dinner
  if (mealType === 'lunch' || mealType === 'dinner') {
    const vegetables = suitableIngredients.filter(ing => ing.category === 'vegetable');
    if (vegetables.length > 0) {
      const numVeggies = Math.min(2, vegetables.length);
      // Shuffle for intra-meal variety first, then hoist week-unused candidates
      // (stable, rng-free) so the slice prefers fresh ones while still filling
      // both slots when only one fresh vegetable exists.
      const ordered = preferUnusedOrdered(rng.shuffle(vegetables), weekUsedIngredientIds);
      selected.push(...ordered.slice(0, numVeggies));
    }
  }

  // Add fruit for breakfast/snack
  if (mealType === 'breakfast' || mealType === 'snack') {
    const fruits = preferUnusedPick(
      suitableIngredients.filter(ing => ing.category === 'fruit'),
      weekUsedIngredientIds
    );
    if (fruits.length > 0) {
      selected.push(fruits[rng.int(fruits.length)]);
    }
  }

  // Add fat
  const fats = preferUnusedPick(
    suitableIngredients.filter(ing => ing.category === 'fat'),
    weekUsedIngredientIds
  );
  if (fats.length > 0) {
    selected.push(fats[rng.int(fats.length)]);
  }

  // Add misc/seasoning
  const misc = preferUnusedPick(
    suitableIngredients.filter(ing => ing.category === 'misc'),
    weekUsedIngredientIds
  );
  if (misc.length > 0 && (mealType === 'lunch' || mealType === 'dinner')) {
    selected.push(misc[rng.int(misc.length)]);
  }

  return selected;
}
