import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Recipe, Macros, MealPlan } from '@/types';
import { sampleRecipes } from '@/data/sampleData';

interface MealSwapperProps {
  mealPlan: MealPlan;
  onSwap: (dayNumber: number, mealIndex: number, newRecipe: Recipe) => void;
}

export const MealSwapper = ({ mealPlan, onSwap }: MealSwapperProps) => {
  const [selectedMeal, setSelectedMeal] = useState<{ day: number; index: number } | null>(null);
  const [alternativeRecipes, setAlternativeRecipes] = useState<Recipe[]>([]);
  const { toast } = useToast();

  const findAlternatives = (mealType: string, currentMacros: Macros) => {
    // Find recipes with similar macros (within 15% tolerance)
    const alternatives = sampleRecipes.filter(recipe => {
      if (recipe.category !== mealType && mealType !== 'snack') return false;
      
      const caloriesDiff = Math.abs(recipe.macrosPerServing.calories - currentMacros.calories);
      const proteinDiff = Math.abs(recipe.macrosPerServing.protein - currentMacros.protein);
      
      return (
        caloriesDiff <= currentMacros.calories * 0.15 &&
        proteinDiff <= currentMacros.protein * 0.15
      );
    });
    
    return alternatives.slice(0, 5); // Return top 5 alternatives
  };

  const handleMealSelect = (dayNumber: number, mealIndex: number) => {
    const meal = mealPlan.meals[mealIndex];
    if (!meal || !meal.recipes[0]) return;
    
    setSelectedMeal({ day: dayNumber, index: mealIndex });
    const alternatives = findAlternatives(
      meal.mealType,
      meal.recipes[0].adjustedMacros
    );
    setAlternativeRecipes(alternatives);
  };

  const handleSwap = (newRecipe: Recipe) => {
    if (!selectedMeal) return;
    
    onSwap(selectedMeal.day, selectedMeal.index, newRecipe);
    
    toast({
      title: "Meal Swapped",
      description: `Successfully swapped to ${newRecipe.name}`,
    });
    
    setSelectedMeal(null);
    setAlternativeRecipes([]);
  };

  const getMacroComparison = (original: Macros, alternative: Macros) => {
    const calDiff = alternative.calories - original.calories;
    const protDiff = alternative.protein - original.protein;
    
    return {
      calories: calDiff > 0 ? `+${calDiff}` : `${calDiff}`,
      protein: protDiff > 0 ? `+${protDiff}g` : `${protDiff}g`,
      isGood: Math.abs(calDiff) <= 50 && Math.abs(protDiff) <= 5
    };
  };

  return (
    <Card className="p-6 shadow-card">
      <h3 className="text-xl font-bold mb-4 text-primary">Smart Meal Swapper</h3>
      <p className="text-muted-foreground mb-4">
        Swap meals while maintaining your macro targets
      </p>

      {/* Current Meals */}
      <div className="space-y-4 mb-6">
        <h4 className="font-semibold">Day {mealPlan.day} Meals</h4>
        {mealPlan.meals.map((meal, idx) => (
          <div
            key={idx}
            className={`p-4 border rounded-lg cursor-pointer transition-all hover:border-primary ${
              selectedMeal?.index === idx ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onClick={() => handleMealSelect(mealPlan.day, idx)}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{meal.time} - {meal.mealType}</p>
                <p className="text-sm text-muted-foreground">
                  {meal.recipes[0]?.recipe.name || 'No recipe'}
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline">
                  {meal.totalMacros.calories} kcal
                </Badge>
                <div className="text-xs text-muted-foreground mt-1">
                  P: {meal.totalMacros.protein}g | C: {meal.totalMacros.carbs}g
                </div>
              </div>
              <RefreshCw className="w-4 h-4 ml-2 text-primary" />
            </div>
          </div>
        ))}
      </div>

      {/* Alternative Recipes */}
      {selectedMeal && alternativeRecipes.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold">Alternative Recipes</h4>
          {alternativeRecipes.map((recipe) => {
            const originalMeal = mealPlan.meals[selectedMeal.index];
            const comparison = getMacroComparison(
              originalMeal.recipes[0].adjustedMacros,
              recipe.macrosPerServing
            );
            
            return (
              <Card
                key={recipe.id}
                className="p-4 border hover:border-primary transition-all cursor-pointer"
                onClick={() => handleSwap(recipe)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{recipe.name}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {recipe.prepTime + recipe.cookTime} min
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {recipe.difficulty}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{recipe.macrosPerServing.calories} kcal</span>
                      {comparison.isGood ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <X className="w-4 h-4 text-warning" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Cal: {comparison.calories} | Prot: {comparison.protein}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedMeal && alternativeRecipes.length === 0 && (
        <p className="text-center text-muted-foreground py-4">
          No suitable alternatives found for this meal
        </p>
      )}
    </Card>
  );
};