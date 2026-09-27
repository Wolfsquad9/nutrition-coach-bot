/**
 * Eligibility boundary — the single source of truth for the ingredient pool
 * that may enter recipe generation.
 *
 * Why this module exists
 * ----------------------
 * Generation previously received `preferredIngredients` directly and had no
 * knowledge of blocked ingredients, allergens or dietary restrictions. Safety
 * therefore relied on an implicit invariant (the UI toggle keeps `blocked` and
 * `preferred` disjoint). This module makes the rule explicit, pure and
 * testable, and every generation entry point now receives the pool produced
 * here:
 *
 *   client inputs → preferred → minus blocked → minus allergens
 *                 → minus diet-incompatible → minus disliked → generation pool
 *
 * Hard invariant: `blocked ∩ preferred` NEVER reaches generation. The blocked
 * side always wins over a preference.
 *
 * Design constraints (Phase 1)
 * ----------------------------
 * - Pure and deterministic: no I/O, no RNG, stable input order.
 * - No nutrition logic: this module never computes or alters macros/calories.
 * - No fuzzy matching: free-text client fields are mapped through a closed
 *   alias table (allergies/intolerances) or by exact id/name equality
 *   (dislikedFoods). Anything unmapped is reported in `warnings` and must be
 *   handled with explicit ingredient blocking.
 * - Unsupported diets (`keto`, `paleo`) are deliberately NOT guessed at; they
 *   are reported as warnings instead of inventing heuristics.
 */

import {
  coreIngredients,
  type AllergenTag,
  type DietTag,
  type IngredientData,
} from '@/data/ingredientDatabase';
import type { Client } from '@/types';

export type { AllergenTag, DietTag };

/** Diet types understood by the client model. */
export type DietType = Client['dietType'];

export type EligibilityRejectionReason =
  /** The id is not present in the ingredient library at all. */
  | 'not-in-library'
  /** Blocked, but not preferred: kept for the coach-facing audit trail. */
  | 'blocked'
  /** Present in both lists — blocked always wins. */
  | 'blocked-and-preferred'
  /** An allergen declared by the client is present in the ingredient. */
  | 'allergen'
  /** Incompatible with the client's diet type. */
  | 'diet'
  /** Exact id/name match against `dislikedFoods`. */
  | 'disliked';

export interface EligibilityRejection {
  id: string;
  reason: EligibilityRejectionReason;
  /** Allergen tag, diet type, or the matched token, when relevant. */
  detail?: string;
}

export interface EligibilityInput {
  clientId?: string | null;
  /** Ingredients the coach marked as liked/preferred. */
  preferredIngredientIds: readonly string[];
  /** Ingredients the coach explicitly blocked. */
  blockedIngredientIds?: readonly string[];
  /** `Client.allergies` (free text). */
  allergies?: readonly string[];
  /** `Client.intolerances` (free text). */
  intolerances?: readonly string[];
  /** `Client.dislikedFoods` (free text). */
  dislikedFoods?: readonly string[];
  /** `Client.dietType`. */
  dietType?: DietType | null;
  /** Injectable library (defaults to `coreIngredients`). */
  library?: readonly IngredientData[];
}

export interface EligibleIngredientPool {
  clientId: string | null;
  /** The generation allow-list. Ordered, de-duplicated, library-validated. */
  ingredientIds: readonly string[];
  /** Resolved library records matching `ingredientIds`. */
  ingredients: readonly IngredientData[];
  /** Complete audit trail of everything that was not eligible. */
  excluded: readonly EligibilityRejection[];
  /** Non-fatal, coach-visible limitations (unmapped text, unsupported diet…). */
  warnings: readonly string[];
  /** Allergen tags extracted from `allergies` + `intolerances`. */
  effectiveAllergens: readonly AllergenTag[];
}

/**
 * Closed vocabulary: canonical token → allergen tag. Exact (normalised)
 * equality only — never substring/fuzzy matching.
 */
const ALLERGEN_ALIASES: Readonly<Record<AllergenTag, readonly string[]>> = {
  gluten: ['gluten', 'wheat'],
  dairy: ['dairy', 'milk', 'lactose'],
  eggs: ['egg', 'eggs'],
  fish: ['fish'],
  nuts: ['nut', 'nuts', 'peanut', 'peanuts', 'tree nut', 'tree nuts'],
  soy: ['soy', 'soya'],
  sesame: ['sesame'],
  shellfish: ['shellfish', 'crustacean', 'crustaceans'],
};

/**
 * Diet nesting. An ingredient tagged `vegan` also satisfies vegetarian,
 * pescatarian and omnivore; an ingredient tagged `pescatarian` satisfies
 * pescatarian and omnivore, and so on.
 */
const DIET_NESTING: Readonly<Record<'vegan' | 'vegetarian' | 'pescatarian', readonly DietTag[]>> = {
  vegan: ['vegan'],
  vegetarian: ['vegan', 'vegetarian'],
  pescatarian: ['vegan', 'vegetarian', 'pescatarian'],
};

const UNSUPPORTED_DIET_TYPES: readonly DietType[] = ['keto', 'paleo'];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Map free-text allergy/intolerance tokens onto the closed allergen
 * vocabulary. Unmapped tokens are returned so callers can surface them
 * instead of silently pretending the restriction is enforced.
 */
export function normalizeAllergenTokens(tokens: readonly string[]): {
  tags: AllergenTag[];
  unmapped: string[];
} {
  const tags: AllergenTag[] = [];
  const unmapped: string[] = [];
  const seenUnmapped = new Set<string>();

  for (const raw of tokens) {
    const token = normalizeToken(raw ?? '');
    if (!token) continue;

    const matchedTag = (Object.keys(ALLERGEN_ALIASES) as AllergenTag[]).find((tag) =>
      ALLERGEN_ALIASES[tag].includes(token),
    );

    if (matchedTag) {
      if (!tags.includes(matchedTag)) tags.push(matchedTag);
    } else if (!seenUnmapped.has(token)) {
      seenUnmapped.add(token);
      unmapped.push(token);
    }
  }

  return { tags, unmapped };
}

/**
 * Whether an ingredient may be used for a client on the given diet.
 *
 * Fails closed for diet-restricted clients: an ingredient with no declared
 * `dietTags` is NOT assumed compatible with vegan/vegetarian/pescatarian.
 * `keto` and `paleo` cannot be enforced from the current metadata, so they
 * pass through (the caller reports a warning) rather than guessing.
 */
export function isIngredientCompatibleWithDiet(
  ingredient: IngredientData,
  dietType: DietType | null | undefined,
): boolean {
  if (!dietType || dietType === 'omnivore') return true;
  if (UNSUPPORTED_DIET_TYPES.includes(dietType)) return true;

  const allowed = DIET_NESTING[dietType];
  const tags = ingredient.dietTags;
  if (!tags || tags.length === 0) return false;
  return tags.some((tag) => allowed.includes(tag));
}

/**
 * Exact (case-insensitive) match of a disliked food against an ingredient's
 * id or name. Synonyms and partial names are intentionally NOT resolved.
 */
export function findDislikedMatch(
  ingredient: IngredientData,
  dislikedFoods: readonly string[],
): string | null {
  const identifiers = new Set([normalizeToken(ingredient.id), normalizeToken(ingredient.name)]);
  for (const disliked of dislikedFoods) {
    const token = normalizeToken(disliked ?? '');
    if (!token) continue;
    if (identifiers.has(token)) return disliked;
  }
  return null;
}

/**
 * Resolve the client's eligible ingredient pool.
 *
 * Pure: same input ⇒ same output. `blocked` always wins over `preferred`.
 */
export function resolveEligibleIngredients(input: EligibilityInput): EligibleIngredientPool {
  const library = input.library ?? coreIngredients;
  const libraryById = new Map(library.map((ingredient) => [ingredient.id, ingredient] as const));

  const dietType = input.dietType ?? null;
  const { tags: effectiveAllergens, unmapped: unmappedAllergyTokens } = normalizeAllergenTokens([
    ...(input.allergies ?? []),
    ...(input.intolerances ?? []),
  ]);
  const allergenSet = new Set(effectiveAllergens);

  const blockedIds = dedupeStrings((input.blockedIngredientIds ?? []).map((id) => id.trim()));
  const blockedSet = new Set(blockedIds);
  const dislikedFoods = dedupeStrings((input.dislikedFoods ?? []).map((food) => food.trim()));

  const warnings: string[] = [];
  const excluded: EligibilityRejection[] = [];
  const ingredients: IngredientData[] = [];
  const seen = new Set<string>();

  for (const rawId of input.preferredIngredientIds ?? []) {
    const id = (rawId ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const ingredient = libraryById.get(id);
    if (!ingredient) {
      excluded.push({ id, reason: 'not-in-library' });
      continue;
    }

    // Hard invariant: a blocked ingredient never enters generation, even when
    // it is also marked as preferred (e.g. imported data containing both).
    if (blockedSet.has(id)) {
      excluded.push({ id, reason: 'blocked-and-preferred', detail: 'blocked ingredients always win' });
      continue;
    }

    const matchingAllergen = (ingredient.allergens ?? []).find((tag) => allergenSet.has(tag));
    if (matchingAllergen) {
      excluded.push({ id, reason: 'allergen', detail: matchingAllergen });
      continue;
    }

    if (!isIngredientCompatibleWithDiet(ingredient, dietType)) {
      excluded.push({ id, reason: 'diet', detail: dietType ?? undefined });
      continue;
    }

    const dislikedMatch = findDislikedMatch(ingredient, dislikedFoods);
    if (dislikedMatch) {
      excluded.push({ id, reason: 'disliked', detail: dislikedMatch });
      continue;
    }

    ingredients.push(ingredient);
  }

  // Blocked ids that were never preferred are still part of the audit trail.
  for (const id of blockedIds) {
    if (!seen.has(id)) excluded.push({ id, reason: 'blocked' });
  }

  if (unmappedAllergyTokens.length > 0) {
    warnings.push(
      `Allergy/intolerance value(s) not recognised and therefore NOT enforced: ${unmappedAllergyTokens.join(', ')}. ` +
        'Block the corresponding ingredients explicitly.',
    );
  }

  if (dietType && UNSUPPORTED_DIET_TYPES.includes(dietType)) {
    warnings.push(
      `Diet type "${dietType}" cannot be enforced from the current ingredient metadata; no ingredients were filtered for it.`,
    );
  }

  const unknownBlockedIds = blockedIds.filter((id) => !libraryById.has(id));
  if (unknownBlockedIds.length > 0) {
    warnings.push(`Blocked ingredient id(s) not found in the library and ignored: ${unknownBlockedIds.join(', ')}.`);
  }

  const matchedDislikes = new Set(
    excluded
      .filter((entry) => entry.reason === 'disliked' && entry.detail)
      .map((entry) => normalizeToken(entry.detail as string)),
  );
  const unmatchedDislikes = dislikedFoods.filter((food) => !matchedDislikes.has(normalizeToken(food)));
  if (unmatchedDislikes.length > 0) {
    warnings.push(
      `Disliked food(s) not matched to any ingredient (exact id/name match only): ${unmatchedDislikes.join(', ')}.`,
    );
  }

  return {
    clientId: input.clientId ?? null,
    ingredientIds: ingredients.map((ingredient) => ingredient.id),
    ingredients,
    excluded,
    warnings,
    effectiveAllergens,
  };
}

