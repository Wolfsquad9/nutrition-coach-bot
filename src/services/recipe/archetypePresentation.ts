import type { GeneratedRecipe } from './types';
import type { RecipeArchetype } from './archetypes';
import type { IngredientData } from '@/data/ingredientDatabase';

/**
 * Pure, deterministic presentation-layer resolver.
 *
 * Converts an existing `GeneratedRecipe.archetypeId` into presentation metadata
 * using the existing archetype catalogue. It is a pure reader: it never mutates
 * the catalogue, never mutates the recipe, and never feeds back into recipe
 * generation.
 *
 * The result is a discriminated union, one member per outcome:
 *
 *  - `resolved`: the recipe's `archetypeId` is present AND found in the catalogue.
 *                `presentation` carries:
 *                  - `archetypeId` (from the recipe)
 *                  - `name` (catalogue's fixed, human-readable display name)
 *                  - `title` (the catalogue template title, with `{role}` placeholders
 *                    substituted from the recipe's `selectedIngredients`)
 *  - `legacy`:    the recipe carries no `archetypeId`. Returns no presentation.
 *  - `unknown`:   the recipe's `archetypeId` is present but not in the catalogue.
 *                Diagnostics only: carries the id, never a fabricated name or title.
 */
export interface ArchetypePresentation {
  /** The archetype id, taken directly from the generated recipe. */
  archetypeId: string;
  /** Catalogue's fixed human-readable name, e.g. 'Overnight Oats / Porridge'. */
  name: string;
  /** Template title with `{role}` placeholders filled from the recipe. */
  title: string;
}

export type ArchetypePresentationResult =
  | { readonly kind: 'resolved'; presentation: ArchetypePresentation }
  | { readonly kind: 'legacy' }
  | { readonly kind: 'unknown'; archetypeId: string };

/**
 * The minimal structural input the resolver reads — exactly the two fields it
 * consumes. `GeneratedRecipe` satisfies it directly, and UI layers adapt other
 * recipe-bearing shapes (e.g. `MealData`) by mapping their field names, so the
 * resolver stays free of UI types and of any casts.
 */
export type ArchetypePresentableRecipe = Pick<
  GeneratedRecipe,
  'archetypeId' | 'selectedIngredients'
>;

/** Resolve a recipe's archetype id into presentation metadata (or none). */
export function resolveArchetypePresentation(
  recipe: ArchetypePresentableRecipe,
  catalogue: ReadonlyMap<string, RecipeArchetype>,
): ArchetypePresentationResult {
  const archetypeId = recipe.archetypeId;

  // Legacy fallback: no id at all -> no presentation, no inference, no mutation.
  if (!archetypeId) {
    return { kind: 'legacy' };
  }

  const archetype = catalogue.get(archetypeId);

  // Unknown id: diagnostics only. Never fabricate a name or title.
  if (!archetype) {
    return { kind: 'unknown', archetypeId };
  }

  const { name, template } = archetype;

  return {
    kind: 'resolved',
    presentation: {
      archetypeId,
      name,
      // Fall back to the catalogue's fixed name whenever the template cannot be
      // fully resolved (e.g. missing ingredients or an empty template).
      title: resolveTemplateTitle(template.title, recipe.selectedIngredients) || name,
    },
  };
}

/**
 * Resolve template placeholders such as `{protein}` or `{carbohydrate}` into the
 * matching selected ingredient's display name, keyed by the ingredient's `category`
 * (which is exactly the archetype role vocabulary).
 *
 * Deterministic: no RNG, no `Date.now()`, no mutation of inputs. A placeholder
 * whose role is not present in the recipe is left unresolved; the caller falls
 * back to the catalogue name so that no misleading title is ever emitted.
 */
function resolveTemplateTitle(
  templateTitle: string,
  selectedIngredients: readonly IngredientData[] = [],
): string {
  if (!templateTitle) {
    return '';
  }

  const resolved = templateTitle.replace(/\{(\w+)\}/g, (match, role) => {
    if (selectedIngredients.length === 0) {
      return match;
    }
    const ingredient = selectedIngredients.find((item) => item.category === role);
    return ingredient?.name ?? match;
  });

  // Never emit a title containing unresolved `{role}` placeholders.
  return resolved.includes('{') ? '' : resolved;
}
