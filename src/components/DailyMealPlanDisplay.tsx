import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Utensils, Coffee, Sun, Moon, Cookie } from 'lucide-react';
import type { DailyMealPlan, MealData } from '@/data/ingredientDatabase';
import type { Macros } from '@/types';

interface DailyMealPlanDisplayProps {
  dailyPlan: DailyMealPlan;
  totalMacros: Macros;
  targetMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  variance: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

const MEAL_CONFIG = {
  breakfast: {
    label: 'Petit-déjeuner',
    icon: Coffee,
    colorClass: 'text-warning',
    bgClass: 'bg-warning/10 border-warning/20',
  },
  lunch: {
    label: 'Déjeuner',
    icon: Sun,
    colorClass: 'text-info',
    bgClass: 'bg-info/10 border-info/20',
  },
  dinner: {
    label: 'Dîner',
    icon: Moon,
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10 border-primary/20',
  },
  snack: {
    label: 'Collation',
    icon: Cookie,
    colorClass: 'text-success',
    bgClass: 'bg-success/10 border-success/20',
  },
} as const;

function MealSection({ 
  mealType, 
  mealData 
}: { 
  mealType: keyof typeof MEAL_CONFIG; 
  mealData: MealData;
}) {
  const config = MEAL_CONFIG[mealType];
  const Icon = config.icon;

  if (mealData.ingredients.length === 0) {
    return (
      <div className={`p-4 rounded-lg border ${config.bgClass}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-5 w-5 ${config.colorClass}`} />
          <h4 className="font-semibold text-foreground">{config.label}</h4>
        </div>
        <p className="text-sm text-muted-foreground italic">
          Aucun ingrédient disponible pour ce repas
        </p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${config.bgClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${config.colorClass}`} />
          <h4 className="font-semibold text-foreground">{config.label}</h4>
        </div>
        <Badge variant="secondary" className="text-xs">
          {mealData.macros.calories} kcal
        </Badge>
      </div>

      {/* Recipe Text */}
      {mealData.recipeText && (
        <p className="text-sm text-foreground mb-3 leading-relaxed">
          {mealData.recipeText}
        </p>
      )}

      {/* Ingredients */}
      <div className="mb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Ingrédients
        </p>
        <div className="flex flex-wrap gap-1.5">
          {mealData.ingredients.map((ing, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {ing.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Macros */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="text-success font-medium">P: {mealData.macros.protein}g</span>
        <span className="text-info font-medium">C: {mealData.macros.carbs}g</span>
        <span className="text-warning font-medium">L: {mealData.macros.fat}g</span>
        {mealData.macros.fiber !== undefined && (
          <span>Fibres: {mealData.macros.fiber}g</span>
        )}
      </div>
    </div>
  );
}

export function DailyMealPlanDisplay({
  dailyPlan,
  totalMacros,
  targetMacros,
  variance,
}: DailyMealPlanDisplayProps) {
  const getVarianceColor = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue <= 5) return 'text-success';
    if (absValue <= 10) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Utensils className="h-5 w-5 text-primary" />
          Plan Repas Journalier
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Daily Totals Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Calories</p>
            <p className="text-xl font-bold text-primary">{totalMacros.calories}</p>
            <p className={`text-xs ${getVarianceColor(variance.calories)}`}>
              ({variance.calories > 0 ? '+' : ''}{variance.calories}%)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Protéines</p>
            <p className="text-xl font-bold text-success">{totalMacros.protein}g</p>
            <p className={`text-xs ${getVarianceColor(variance.protein)}`}>
              ({variance.protein > 0 ? '+' : ''}{variance.protein}%)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Glucides</p>
            <p className="text-xl font-bold text-info">{totalMacros.carbs}g</p>
            <p className={`text-xs ${getVarianceColor(variance.carbs)}`}>
              ({variance.carbs > 0 ? '+' : ''}{variance.carbs}%)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Lipides</p>
            <p className="text-xl font-bold text-warning">{totalMacros.fat}g</p>
            <p className={`text-xs ${getVarianceColor(variance.fat)}`}>
              ({variance.fat > 0 ? '+' : ''}{variance.fat}%)
            </p>
          </div>
        </div>

        {/* Target vs Actual */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Objectifs journaliers</p>
          <div className="flex gap-4 text-xs">
            <span>Cible: {targetMacros.calories} kcal</span>
            <span>P: {targetMacros.protein}g</span>
            <span>C: {targetMacros.carbs}g</span>
            <span>L: {targetMacros.fat}g</span>
          </div>
        </div>

        <Separator />

        {/* Meal Sections */}
        <div className="space-y-4">
          <MealSection mealType="breakfast" mealData={dailyPlan.breakfast} />
          <MealSection mealType="lunch" mealData={dailyPlan.lunch} />
          <MealSection mealType="dinner" mealData={dailyPlan.dinner} />
          <MealSection mealType="snack" mealData={dailyPlan.snack} />
        </div>
      </CardContent>
    </Card>
  );
}
