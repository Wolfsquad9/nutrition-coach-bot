import type { IngredientData } from '@/data/ingredientDatabase';
import type { MealType } from './constants';
import type { DietType } from './eligibility';

/**
 * Phase 3B — recipe archetype catalogue.
 *
 * PURE DATA. This module contains no selection logic, no randomness and no
 * nutrition maths. An archetype is a *declaration of culinary shape*: which
 * meal types it belongs to, which ingredient roles it structurally requires,
 * which roles it may optionally draw from, which client diets it can serve, and
 * a text hook for a later presentation phase.
 *
 * It deliberately selects nothing. Ingredient selection stays in
 * `./selectors` and the canonical nutrition engine stays in
 * `@/domain/nutrition/engine`. Phase 3C consumes this catalogue; until then it
 * is inert data and generator behaviour is unchanged.
 *
 * ---------------------------------------------------------------------------
 * INVARIANTS a consumer (3C) MUST honour
 * ---------------------------------------------------------------------------
 *
 * 1. Operate ONLY on `allowedIngredientIds` — the output of
 *    `resolveEligibleIngredients()` (`./eligibility`). An archetype must never
 *    be handed raw preferred-ingredient ids as a stand-in for eligibility, or
 *    it becomes a safety bypass.
 * 2. The effective pool is `allowedIngredientIds ∩ ingredients whose
 *    allowedMeals includes the slot`.
 * 3. A required role that cannot be filled from that pool makes the archetype
 *    **UNSATISFIABLE for that client/slot**: skip it. Never partially fill a
 *    required role, never fall back to another archetype's structure.
 * 4. `compatibleDiets` is a client-level gate evaluated BEFORE role filling,
 *    so an archetype is never attempted for a diet it cannot serve.
 * 5. Diet semantics are NOT reinterpreted here. The nest rules live solely in
 *    `isIngredientCompatibleWithDiet()`; this file only lists which diets an
 *    archetype admits.
 */

/**
 * An ingredient role. Exactly the `category` union of `IngredientData` — the
 * six roles are frozen for Phase 3 and deliberately not extended (there is no
 * `liquid` role; see the smoothie archetype).
 */
export type ArchetypeRole = IngredientData['category'];

/**
 * Diets an archetype can serve. Restricted to the four diets the engine can
 * actually enforce.
 *
 * `keto` and `paleo` are intentionally absent: `resolveEligibleIngredients()`
 * cannot enforce them from current metadata and reports a warning instead, so
 * listing them would imply a safety guarantee that does not exist.
 */
export type ArchetypeDiet = Extract<DietType, 'omnivore' | 'vegetarian' | 'pescatarian' | 'vegan'>;

/** Role → how many ingredients of that role the archetype needs. */
export type ArchetypeRoleCounts = Partial<Record<ArchetypeRole, number>>;

/**
 * Text hook for a later presentation phase (Phase 5). Consumed by nothing yet.
 *
 * `title` uses `{role}` placeholders that a renderer substitutes with the
 * selected ingredient's display name. `steps` are the archetype's method steps
 * — the part that makes a structure read as a real recipe rather than
 * "protein + carb + veg".
 */
export interface ArchetypeTemplate {
  /** Title pattern, e.g. `'Weekend {protein} & {vegetable} Scramble'`. */
  title: string;
  /** Ordered method steps; `{role}` placeholders allowed. */
  steps: readonly string[];
}

export interface RecipeArchetype {
  /** Stable identifier. Never rename: it becomes part of persisted recipes. */
  id: string;
  /** Human-readable name, used for display and plan-level variety scoring. */
  name: string;
  /** Meal types this archetype can produce. */
  supportedMeals: readonly MealType[];
  /**
   * Roles the archetype cannot exist without. Every entry is a hard
   * requirement: if the eligible pool cannot supply it, the archetype is
   * skipped for that client/slot.
   */
  requiredRoles: ArchetypeRoleCounts;
  /**
   * Roles the archetype may draw from without requiring them. An absent or
   * unlisted role is never selected for this archetype.
   */
  optionalRoles: ArchetypeRoleCounts;
  /** Upper bound on total ingredients, so an archetype cannot sprawl. */
  maxIngredients: number;
  /**
   * Client diets this archetype can serve. Evaluated as a client-level gate
   * before role filling. Must be a subset of what its required roles can
   * actually be filled from — enforced by `archetypes.test.ts`.
   */
  compatibleDiets: readonly ArchetypeDiet[];
  /** Text hook for a later presentation phase. Not consumed yet. */
  template: ArchetypeTemplate;
}

const ARCHETYPE_LIST: readonly RecipeArchetype[] = [
  {
    id: 'overnight-oats',
    name: 'Overnight Oats / Porridge',
    supportedMeals: ['breakfast', 'snack'],
    requiredRoles: { carbohydrate: 1, protein: 1, fat: 1 },
    optionalRoles: { fruit: 1, misc: 1 },
    maxIngredients: 5,
    // NOT vegan: the library has no vegan-capable breakfast protein, so this
    // archetype cannot fill its required protein role for a vegan client.
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: 'Overnight {carbohydrate} with {protein}',
      steps: [
        'Combine {carbohydrate} with {protein} and water in a jar.',
        'Stir in {fat} and any fruit until combined.',
        'Cover and refrigerate overnight (4h+).',
        'Top with the reserved fruit and serve cold.',
      ],
    },
  },
  {
    id: 'yogurt-fruit-bowl',
    name: 'Yogurt & Fruit Bowl',
    supportedMeals: ['breakfast', 'snack'],
    requiredRoles: { protein: 1, fruit: 1 },
    optionalRoles: { fat: 1, carbohydrate: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: '{protein} & {fruit} Bowl',
      steps: [
        'Spoon {protein} into a bowl as the base.',
        'Layer in the sliced {fruit}.',
        'Finish with {fat} and a scattering of any dry topping.',
        'Serve immediately, before the fruit softens.',
      ],
    },
  },
  {
    id: 'scramble-omelette',
    name: 'Scramble / Omelette',
    supportedMeals: ['breakfast'],
    requiredRoles: { protein: 1, vegetable: 1, fat: 1 },
    optionalRoles: { misc: 1, carbohydrate: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: '{vegetable} {protein} Omelette',
      steps: [
        'Heat {fat} in a pan over medium heat.',
        'Add the {vegetable} and cook until just softened.',
        'Pour in the beaten {protein} and draw toward the centre.',
        'Fold, plate and season with any herb.',
      ],
    },
  },
  {
    id: 'savoury-breakfast-plate',
    name: 'Savoury Breakfast Plate',
    supportedMeals: ['breakfast'],
    requiredRoles: { protein: 1, carbohydrate: 1, vegetable: 1 },
    optionalRoles: { fat: 1, misc: 1 },
    maxIngredients: 5,
    // NOT vegan: requires a breakfast protein, and the library has none that is
    // vegan-compatible. It would be skipped for vegan clients.
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: 'Savoury {carbohydrate} & {protein} Plate',
      steps: [
        'Toast or warm the {carbohydrate}.',
        'Cook the {protein} until done to preference.',
        'Sauté or steam the {vegetable} in {fat}.',
        'Plate everything together and season.',
      ],
    },
  },
  {
    id: 'smoothie-shake',
    name: 'Smoothie / Shake',
    // Liquid is presentation-only and deliberately NOT a selection role: the
    // six-role category union is frozen, and the liquid is named in the steps.
    supportedMeals: ['breakfast', 'snack'],
    requiredRoles: { fruit: 1, protein: 1 },
    optionalRoles: { fat: 1, carbohydrate: 1 },
    maxIngredients: 4,
    // Supports breakfast AND snack, and role filling is evaluated per meal.
    // 3A measured ZERO vegan proteins available at breakfast (all six vegan
    // proteins are lunch/dinner-only), so the gate must be the stricter slot —
    // otherwise a vegan client's breakfast could select this archetype and then
    // fail to fill `protein`.
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: '{fruit} & {protein} Shake',
      steps: [
        'Add the {fruit} and any frozen ingredient to a blender.',
        'Pour in enough milk, water or yoghurt to reach the blade.',
        'Blend with the {protein} until smooth.',
        'Blend in {fat} briefly and serve immediately.',
      ],
    },
  },
  {
    id: 'sandwich-wrap',
    name: 'Sandwich / Wrap',
    supportedMeals: ['lunch', 'snack'],
    requiredRoles: { protein: 1, carbohydrate: 1, vegetable: 1, fat: 1 },
    optionalRoles: { misc: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} {carbohydrate}',
      steps: [
        'Spread {fat} over the {carbohydrate}.',
        'Layer in the {protein} and prepared {vegetable}.',
        'Fold or roll tightly and rest for a minute to set.',
        'Slice and serve.',
      ],
    },
  },
  {
    id: 'grain-bowl',
    name: 'Grain Bowl',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { carbohydrate: 1, protein: 1, vegetable: 1, fat: 1 },
    optionalRoles: { misc: 1, fruit: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{carbohydrate} Bowl with {protein}',
      steps: [
        'Cook the {carbohydrate} and let it steam-dry.',
        'Season the {protein} and cook until tender.',
        'Whisk {fat} with any mustard or vinegar to dress the bowl.',
        'Build over the grain and finish with {vegetable}.',
      ],
    },
  },
  {
    id: 'pasta-dish',
    name: 'Pasta Dish',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { carbohydrate: 1, protein: 1 },
    optionalRoles: { vegetable: 2, fat: 1, misc: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} {carbohydrate}',
      steps: [
        'Boil the {carbohydrate} until al dente; reserve the water.',
        'Brown the {protein} in oil if available.',
        'Add the {vegetable} and any garlic or chilli.',
        'Toss with the pasta, loosening with the reserved water.',
      ],
    },
  },
  {
    id: 'stir-fry',
    name: 'Stir-fry',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { protein: 1, vegetable: 1, fat: 1 },
    optionalRoles: { carbohydrate: 1, misc: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} Stir-fry',
      steps: [
        'Get the pan very hot with {fat}.',
        'Sear the {protein} and remove.',
        'Stir-fry the {vegetable} with any chilli or ginger.',
        'Return the {protein}, add sauce, and toss to glaze.',
      ],
    },
  },
  {
    id: 'curry-stew',
    name: 'Curry / Stew',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { protein: 1, vegetable: 1, fat: 1, misc: 1 },
    optionalRoles: { carbohydrate: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} Curry',
      steps: [
        'Bloom the {misc} spices in {fat} over low heat.',
        'Add the {vegetable} and cook until softened.',
        'Add the {protein} and enough liquid to just cover.',
        'Simmer until tender; serve over {carbohydrate} if available.',
      ],
    },
  },
  {
    id: 'tray-bake-roast',
    name: 'Tray Bake / Roast',
    supportedMeals: ['dinner'],
    requiredRoles: { protein: 1, vegetable: 1, carbohydrate: 1 },
    optionalRoles: { fat: 1, misc: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: 'Tray-Baked {protein} & {vegetable}',
      steps: [
        'Heat the oven and toss the {vegetable} with {fat}.',
        'Nestle the {protein} in and add the {carbohydrate}.',
        'Season with any dried herb or spice.',
        'Roast until the edges colour and the protein is cooked through.',
      ],
    },
  },
  {
    id: 'fajita-bowl',
    name: 'Fajita / Taco-Style Bowl',
    supportedMeals: ['lunch', 'dinner', 'snack'],
    requiredRoles: { protein: 1, carbohydrate: 1, vegetable: 1, fat: 1 },
    optionalRoles: { misc: 1, fruit: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} Fajita Bowl',
      steps: [
        'Sear the {protein} with any paprika or chilli.',
        'Char the {vegetable} in the same pan.',
        'Warm the {carbohydrate} and spread {fat} on it.',
        'Build the bowl and finish with any fresh coriander or lime.',
      ],
    },
  },
  {
    id: 'chilli-bean-pot',
    name: 'Chilli / Bean Pot',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { protein: 1, vegetable: 1 },
    optionalRoles: { carbohydrate: 1, fat: 1, misc: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} Chilli',
      steps: [
        'Soften the {vegetable} with any onion or pepper.',
        'Add the {protein} and brown it.',
        'Simmer with tomato and any chilli flakes until thick.',
        'Serve over {carbohydrate} with a little {fat} on top.',
      ],
    },
  },
  {
    id: 'big-salad',
    name: 'Big Salad',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { vegetable: 1, fat: 1, protein: 1 },
    optionalRoles: { fruit: 1, misc: 1, carbohydrate: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} & {vegetable} Salad',
      steps: [
        'Whisk {fat} with any vinegar or mustard to make the dressing.',
        'Tear the {vegetable} into a wide bowl.',
        'Add the {protein} and any fruit.',
        'Dress at the table so the leaves stay crisp.',
      ],
    },
  },
  {
    id: 'soup-broth-bowl',
    name: 'Soup / Broth Bowl',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { vegetable: 1, protein: 1, misc: 1 },
    optionalRoles: { fat: 1, carbohydrate: 1 },
    maxIngredients: 6,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{vegetable} & {protein} Soup',
      steps: [
        'Sweat the {vegetable} in {fat} with any aromatics.',
        'Add stock and simmer until the vegetable collapses.',
        'Add the {protein} and cook through.',
        'Serve over {carbohydrate} if available.',
      ],
    },
  },
  {
    id: 'sheet-pan-fish',
    name: 'Sheet-Pan Fish / Seafood Plate',
    supportedMeals: ['dinner'],
    requiredRoles: { protein: 1, vegetable: 1 },
    optionalRoles: { carbohydrate: 1, fat: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'pescatarian'],
    template: {
      title: 'Sheet-Pan {protein} & {vegetable}',
      steps: [
        'Heat the oven and toss the {vegetable} with {fat}.',
        'Nestle the {protein} in and add any citrus or herb.',
        'Season and roast until the fish flakes.',
        'Serve over {carbohydrate} if available.',
      ],
    },
  },
  {
    id: 'burger-patty-plate',
    name: 'Burger / Patty Plate',
    supportedMeals: ['lunch', 'dinner'],
    requiredRoles: { protein: 1, carbohydrate: 1 },
    optionalRoles: { vegetable: 1, fat: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{protein} {carbohydrate} Plate',
      steps: [
        'Shape or season the {protein} and sear it.',
        'Toast the {carbohydrate}.',
        'Add the {vegetable} on top with any cheese or sauce.',
        'Plate with a side salad if no vegetable was used in the patty.',
      ],
    },
  },
  {
    id: 'cottage-cheese-snack-plate',
    name: 'Cottage-Cheese / Savoury Snack Plate',
    supportedMeals: ['snack'],
    requiredRoles: { protein: 1, vegetable: 1 },
    optionalRoles: { fat: 1, misc: 1, carbohydrate: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: '{protein} & {vegetable} Snack Plate',
      steps: [
        'Spoon {protein} onto a small plate.',
        'Add the {vegetable} alongside.',
        'Finish with {fat} and any cracked pepper.',
        'Serve with the {carbohydrate} if a base is preferred.',
      ],
    },
  },
  {
    id: 'energy-bites-trail-mix',
    name: 'Energy Bites / Trail-Mix Snack',
    supportedMeals: ['snack'],
    requiredRoles: { fat: 1, fruit: 1, protein: 1 },
    optionalRoles: { carbohydrate: 1, misc: 1 },
    maxIngredients: 5,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian', 'vegan'],
    template: {
      title: '{fruit} & {fat} Energy Bites',
      steps: [
        'Mash the {fruit} with any dry {carbohydrate}.',
        'Bind with {fat} and a spoonful of the {protein}.',
        'Roll into small balls, or keep layered as a trail mix.',
        'Chill briefly to firm up.',
      ],
    },
  },
  {
    id: 'protein-snack-plate',
    name: 'Boiled-Egg / Tuna Protein Snack',
    supportedMeals: ['snack'],
    requiredRoles: { protein: 1 },
    optionalRoles: { vegetable: 1, fat: 1, misc: 1, carbohydrate: 1 },
    maxIngredients: 4,
    compatibleDiets: ['omnivore', 'vegetarian', 'pescatarian'],
    template: {
      title: '{protein} Quick Snack',
      steps: [
        'Prepare the {protein} (boiled, tinned or ready to eat).',
        'Add the {vegetable} for volume.',
        'Finish with {fat} and any seasoning.',
        'Serve with {carbohydrate} if a more substantial snack is needed.',
      ],
    },
  },
];

/**
 * The catalogue, frozen so it is a runtime constant: an accidental mutation of
 * a role map or template in a later phase would silently change every generated
 * meal rather than failing loudly.
 *
 * Defined after `ARCHETYPE_LIST` because it is derived from it.
 */
export const ARCHETYPES: readonly RecipeArchetype[] = Object.freeze(
  ARCHETYPE_LIST.map((archetype) =>
    Object.freeze({
      ...archetype,
      supportedMeals: Object.freeze([...archetype.supportedMeals]) as readonly MealType[],
      requiredRoles: Object.freeze({ ...archetype.requiredRoles }),
      optionalRoles: Object.freeze({ ...archetype.optionalRoles }),
      compatibleDiets: Object.freeze([...archetype.compatibleDiets]) as readonly ArchetypeDiet[],
      template: Object.freeze({
        title: archetype.template.title,
        steps: Object.freeze([...archetype.template.steps]) as readonly string[],
      }),
    }),
  ),
);

/** Look-up by id. */
export const ARCHETYPES_BY_ID: ReadonlyMap<string, RecipeArchetype> = new Map(
  ARCHETYPES.map((archetype) => [archetype.id, archetype]),
);

/** Archetypes that declare support for a meal slot, in catalogue order. */
export function getArchetypesForMeal(mealType: MealType): readonly RecipeArchetype[] {
  return ARCHETYPES.filter((archetype) => archetype.supportedMeals.includes(mealType));
}

/** All role keys referenced anywhere in the catalogue. Used by validation tests. */
export function collectArchetypeRoles(): Set<ArchetypeRole> {
  const roles = new Set<ArchetypeRole>();
  for (const archetype of ARCHETYPES) {
    for (const role of Object.keys(archetype.requiredRoles) as ArchetypeRole[]) roles.add(role);
    for (const role of Object.keys(archetype.optionalRoles) as ArchetypeRole[]) roles.add(role);
  }
  return roles;
}