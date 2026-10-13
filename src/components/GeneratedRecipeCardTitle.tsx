import { Utensils } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import {
  ARCHETYPES_BY_ID,
  resolveArchetypePresentation,
  type GeneratedRecipe,
} from '@/services/recipeService';

/**
 * The generated-recipe card heading, keeping exactly one visible name:
 *
 *  - archetype known:  the resolved archetype title (catalogue-derived);
 *  - legacy / unknown: `recipe.name`, unchanged. An unknown archetype id never
 *    yields a fabricated title (and its raw id is not displayed).
 */
export function GeneratedRecipeCardTitle({ recipe }: { recipe: GeneratedRecipe }) {
  const result = resolveArchetypePresentation(recipe, ARCHETYPES_BY_ID);
  const title = result.kind === 'resolved' ? result.presentation.title : recipe.name;

  return (
    <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
      <Utensils className="h-5 w-5 text-primary" />
      {title}
    </CardTitle>
  );
}