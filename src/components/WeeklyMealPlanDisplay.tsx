import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Utensils, Coffee, Sun, Moon, Cookie } from 'lucide-react';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MealTimeType, MealData } from '@/data/ingredientDatabase';
import { useState } from 'react';

interface WeeklyMealPlanDisplayProps {
  weeklyPlan: WeeklyMealPlanResult;
}

const mealIcons: Record<MealTimeType, React.ReactNode> = {
  breakfast: <Coffee className="h-4 w-4" />,
  lunch: <Sun className="h-4 w-4" />,
  dinner: <Moon className="h-4 w-4" />,
  snack: <Cookie className="h-4 w-4" />,
};

const mealLabels: Record<MealTimeType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

function MealSection({ mealType, meal }: { mealType: MealTimeType; meal: MealData }) {
  const [isOpen, setIsOpen] = useState(false);

  if (meal.ingredients.length === 0) {
    return (
      <div className="p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          {mealIcons[mealType]}
          <span className="font-medium">{mealLabels[mealType]}</span>
          <span className="text-sm">- Aucun ingrédient disponible</span>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 bg-card hover:bg-card-hover rounded-lg border border-border transition-colors">
          <div className="flex items-center gap-2">
            {mealIcons[mealType]}
            <span className="font-medium">{mealLabels[mealType]}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                P: {meal.macros.protein}g
              </Badge>
              <Badge variant="outline" className="bg-info/10 text-info border-info/20">
                C: {meal.macros.carbs}g
              </Badge>
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                F: {meal.macros.fat}g
              </Badge>
              <Badge variant="secondary">
                {meal.macros.calories} kcal
              </Badge>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-4 bg-muted/30 rounded-lg space-y-3">
          <div>
            <h5 className="text-sm font-medium mb-2">Ingrédients:</h5>
            <div className="flex flex-wrap gap-2">
              {meal.ingredients.map((ing, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {ing.name} ({ing.typical_serving_size_g}g)
                </Badge>
              ))}
            </div>
          </div>
          {meal.recipeText && (
            <div>
              <h5 className="text-sm font-medium mb-2">Recette:</h5>
              <div className="text-sm text-muted-foreground whitespace-pre-line">
                {meal.recipeText}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DayCard({ dayNumber, dayName, plan }: { 
  dayNumber: number; 
  dayName: string; 
  plan: WeeklyMealPlanResult['days'][0]['plan'];
}) {
  const [isOpen, setIsOpen] = useState(dayNumber === 1);
  const mealTypes: MealTimeType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  // Calculate percentage variance
  const percentVariance = {
    calories: plan.targetMacros.calories > 0 
      ? ((plan.totalMacros.calories - plan.targetMacros.calories) / plan.targetMacros.calories) * 100 
      : 0,
    protein: plan.targetMacros.protein > 0 
      ? ((plan.totalMacros.protein - plan.targetMacros.protein) / plan.targetMacros.protein) * 100 
      : 0,
  };

  const hasWarning = plan.convergenceInfo && !plan.convergenceInfo.converged;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <Card className={`p-4 hover:bg-card-hover transition-colors cursor-pointer ${hasWarning ? 'border-warning/50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasWarning ? 'bg-warning/10' : 'bg-primary/10'}`}>
                <span className={`font-bold ${hasWarning ? 'text-warning' : 'text-primary'}`}>{dayNumber}</span>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{dayName}</h3>
                  {hasWarning && <span className="text-warning text-xs">⚠️</span>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {plan.totalMacros.calories} kcal | P: {plan.totalMacros.protein}g | C: {plan.totalMacros.carbs}g | F: {plan.totalMacros.fat}g
                </p>
                <p className={`text-xs ${Math.abs(percentVariance.calories) <= 5 ? 'text-success' : Math.abs(percentVariance.calories) <= 10 ? 'text-warning' : 'text-destructive'}`}>
                  Variance: {percentVariance.calories > 0 ? '+' : ''}{percentVariance.calories.toFixed(1)}% cal
                </p>
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-6 space-y-2">
          {hasWarning && plan.convergenceInfo?.warningMessage && (
            <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-xs text-warning">{plan.convergenceInfo.warningMessage}</p>
            </div>
          )}
          {mealTypes.map(mealType => (
            <MealSection 
              key={mealType} 
              mealType={mealType} 
              meal={plan.dailyPlan[mealType]} 
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function WeeklyMealPlanDisplay({ weeklyPlan }: WeeklyMealPlanDisplayProps) {
  return (
    <Card className="p-6 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Utensils className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-primary">Plan Repas Hebdomadaire</h2>
      </div>

      {/* Weekly Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-card p-3 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Calories/semaine</p>
          <p className="text-lg font-bold text-primary">{weeklyPlan.weeklyTotalMacros.calories}</p>
          <p className="text-xs text-muted-foreground">
            Cible: {weeklyPlan.weeklyTargetMacros.calories}
          </p>
        </div>
        <div className="bg-gradient-card p-3 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Protéines</p>
          <p className="text-lg font-bold text-success">{weeklyPlan.weeklyTotalMacros.protein}g</p>
          <p className="text-xs text-muted-foreground">
            Cible: {weeklyPlan.weeklyTargetMacros.protein}g
          </p>
        </div>
        <div className="bg-gradient-card p-3 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Glucides</p>
          <p className="text-lg font-bold text-info">{weeklyPlan.weeklyTotalMacros.carbs}g</p>
          <p className="text-xs text-muted-foreground">
            Cible: {weeklyPlan.weeklyTargetMacros.carbs}g
          </p>
        </div>
        <div className="bg-gradient-card p-3 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Lipides</p>
          <p className="text-lg font-bold text-warning">{weeklyPlan.weeklyTotalMacros.fat}g</p>
          <p className="text-xs text-muted-foreground">
            Cible: {weeklyPlan.weeklyTargetMacros.fat}g
          </p>
        </div>
      </div>

      {/* Daily Plans */}
      <div className="space-y-3">
        {weeklyPlan.days.map(day => (
          <DayCard 
            key={day.dayNumber}
            dayNumber={day.dayNumber}
            dayName={day.dayName}
            plan={day.plan}
          />
        ))}
      </div>
    </Card>
  );
}
