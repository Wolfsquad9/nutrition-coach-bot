import type { IngredientData } from '@/data/ingredientDatabase';
import type { MealType } from './constants';
import type { Rng } from '@/utils/random';
import {
  getArchetypesForMeal,
  type ArchetypeDiet,
  type ArchetypeRole,
  type RecipeArchetype,
} from './archetypes';
import type { DietType } from './eligibility';

/**
 * Phase 3C — archetype selection and role resolution.
 *
 * This is the ONLY place an archetype turns into ingredients. It sits strictly
 * downstream of the Phase 1 eligibility boundary: the pool it receives has
 * already been intersected with `allowedIngredientIds`, so no selection here can
 * reintroduce a blocked, disliked or allergen-carrying ingredient.
 *
 * It performs NO nutrition maths. It returns a structural ingredient list; the
 * canonical engine in `@/domain/nutrition/engine` remains the sole authority for
 * quantities, calories and macros, exactly as on the legacy path.
 *
 * Invariants enforced here (see ./archetypes for the full contract):
 *  - archetypes are filtered by meal slot, then by client diet;
 *  - a required role that cannot be filled makes the archetype SKIPPED — never
 *    partially filled, never substituted with another archetype's structure;
 *  - selection is driven by the caller's seeded `Rng`, so it is deterministic.
 */

export interface ArchetypeSelection {
  archetype: RecipeArchetype;
  /** Fully resolved ingredients honouring `requiredRoles` then `optionalRoles`. */
  ingredients: IngredientData[];
}

/** Diets that admit every archetype; the four enforceable diets, in nesting order. */
const DIET_ADMISSION: Record<ArchetypeDiet, ReadonlySet<ArchetypeDiet>> = {
  omnivore: new Set<ArchetypeDiet>(['omnivore', 'pescatarian', 'vegetarian', 'vegan']),
  pescatarian: new Set<ArchetypeDiet>(['pescatarian', 'vegetarian', 'vegan']),
  vegetarian: new Set<ArchetypeDiet>(['vegetarian', 'vegan']),
  vegan: new Set<ArchetypeDiet>(['vegan']),
};

/**
 * Map a client diet onto the archetype diet vocabulary.
 *
 * `null`/absent means "no declared restriction", which admits every archetype.
 * Unenforceable diets (`keto`, `paleo`) are reported by the eligibility boundary
 * and deliberately map to `null` here rather than implying a guarantee.
 */
export function toArchetypeDiet(dietType: DietType | null | undefined): ArchetypeDiet | null {
  if (!dietType) return null;
  if (dietType === 'keto' || dietType === 'paleo') return null;
  return dietType;
}

/** Does this archetype serve the client's declared diet? */
export function isArchetypeDietCompatible(
  archetype: RecipeArchetype,
  dietType: DietType | null | undefined
): boolean {
  const diet = toArchetypeDiet(dietType);
  if (diet === null) return true;
  return DIET_ADMISSION[diet].has(diet) && archetype.compatibleDiets.includes(diet);
}

/** Ingredients in `pool` carrying a given role. */
function byRole(pool: readonly IngredientData[], role: ArchetypeRole): IngredientData[] {
  return pool.filter((ingredient) => ingredient.category === role);
}

/**
 * Can every required role of this archetype be filled from `pool`?
 *
 * A `count` above 1 requires that many DISTINCT ingredients of the role, so an
 * archetype can never be satisfied by reusing one ingredient.
 */
export function isArchetypeSatisfiable(
  archetype: RecipeArchetype,
  pool: readonly IngredientData[]
): boolean {
  return (Object.entries(archetype.requiredRoles) as [ArchetypeRole, number][]).every(
    ([role, count]) => byRole(pool, role).length >= count
  );
}

/**
 * Resolve an archetype's ingredients from the eligible pool.
 *
 * Required roles are filled first and completely. Optional roles are then filled
 * in catalogue order, only while capacity remains, and never at the cost of a
 * required role. Returns `null` if the archetype is unsatisfiable — the caller
 * must skip it rather than fall back.
 */
export function resolveArchetypeIngredients(
  archetype: RecipeArchetype,
  pool: readonly IngredientData[],
  rng: Rng
): IngredientData[] | null {
  if (!isArchetypeSatisfiable(archetype, pool)) return null;

  const selected: IngredientData[] = [];
  const taken = new Set<string>();

  for (const [role, count] of Object.entries(archetype.requiredRoles) as [ArchetypeRole, number][]) {
    const candidates = byRole(pool, role).filter((ingredient) => !taken.has(ingredient.id));
    for (const ingredient of rng.shuffle(candidates).slice(0, count)) {
      selected.push(ingredient);
      taken.add(ingredient.id);
    }
  }

  for (const [role, count] of Object.entries(archetype.optionalRoles) as [ArchetypeRole, number][]) {
    if (selected.length >= archetype.maxIngredients) break;
    const candidates = byRole(pool, role).filter(
      (ingredient) => !taken.has(ingredient.id)
    );
    for (const ingredient of rng.shuffle(candidates).slice(0, count)) {
      if (selected.length >= archetype.maxIngredients) break;
      selected.push(ingredient);
      taken.add(ingredient.id);
    }
  }

  return selected;
}

/**
 * Choose an archetype for a meal and resolve its ingredients.
 *
 * `pool` MUST already be restricted to eligible ingredients (see
 * `resolveEligibleIngredients`) AND to those whose `allowedMeals` includes
 * `mealType`. Candidates are tried in catalogue order and the first satisfiable
 * one wins, which keeps the choice deterministic and reproducible.
 */
export function selectArchetypeForMeal(
  pool: readonly IngredientData[],
  mealType: MealType,
  dietType: DietType | null | undefined,
  rng: Rng
): ArchetypeSelection | null {
  const candidates = getArchetypesForMeal(mealType).filter(
    (archetype) =>
      isArchetypeDietCompatible(archetype, dietType) && isArchetypeSatisfiable(archetype, pool)
  );

  if (candidates.length === 0) return null;

  // Shuffle the SATISFIABLE candidates before trying them. Without this the
  // first satisfiable archetype in catalogue order always wins, which collapses
  // every meal in a slot onto a single structure (measured: exactly 1 distinct
  // archetype per slot across 60 seeds) — the opposite of the structural variety
  // this catalogue exists to provide.
  //
  // The shuffle is driven by the caller's seeded `Rng`, so it stays fully
  // deterministic for a given (selectedFoods, mealType, seed) while still
  // distributing structure across seeds. It only reorders archetypes that have
  // ALREADY passed diet and satisfiability filtering, so it cannot widen
  // eligibility or promote an unsatisfiable archetype.
  for (const archetype of rng.shuffle(candidates)) {
    const ingredients = resolveArchetypeIngredients(archetype, pool, rng);
    if (ingredients) return { archetype, ingredients };
  }

  return null;
}