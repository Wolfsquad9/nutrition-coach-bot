/**
 * PrintableMealPlan - Dedicated print-only renderer for nutrition plans.
 * 
 * This component renders the full 7-day meal plan fully expanded:
 * - All 7 days visible
 * - All meals per day visible
 * - All ingredients listed
 * 
 * Design decisions:
 * - No hooks, no UI state, no accordion logic
 * - Pure presentational component consuming domain data
 * - Hidden on screen, visible only when printing
 * - Uses semantic HTML for clean PDF/paper output
 */

import type { WeeklyMealPlanResult } from '@/services/recipeService';
import type { MealTimeType, MealData } from '@/data/ingredientDatabase';
import { formatCalories, formatMacro } from '@/utils/formatters';

interface PrintableMealPlanProps {
  weeklyPlan: WeeklyMealPlanResult;
  clientName?: string;
  generatedDate?: string;
}

const MEAL_ORDER: MealTimeType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABELS: Record<MealTimeType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

function PrintMealSection({ mealType, meal }: { mealType: MealTimeType; meal: MealData }) {
  if (meal.ingredients.length === 0) {
    return (
      <div className="print-meal-section print-meal-empty">
        <h4 className="print-meal-title">{MEAL_LABELS[mealType]}</h4>
        <p className="print-no-ingredients">Aucun ingrédient disponible</p>
      </div>
    );
  }

  return (
    <div className="print-meal-section">
      <div className="print-meal-header">
        <h4 className="print-meal-title">{MEAL_LABELS[mealType]}</h4>
        <div className="print-meal-macros">
          <span className="print-macro print-protein">P: {formatMacro(meal.macros.protein)}g</span>
          <span className="print-macro print-carbs">C: {formatMacro(meal.macros.carbs)}g</span>
          <span className="print-macro print-fat">F: {formatMacro(meal.macros.fat)}g</span>
          <span className="print-macro print-calories">{formatCalories(meal.macros.calories)} kcal</span>
        </div>
      </div>
      
      <div className="print-ingredients">
        <h5 className="print-ingredients-title">Ingrédients:</h5>
        <ul className="print-ingredients-list">
          {meal.ingredients.map((ing, idx) => (
            <li key={idx} className="print-ingredient-item">
              {ing.name} ({ing.typical_serving_size_g}g)
            </li>
          ))}
        </ul>
      </div>

      {meal.recipeText && (
        <div className="print-recipe">
          <h5 className="print-recipe-title">Recette:</h5>
          <p className="print-recipe-text">{meal.recipeText}</p>
        </div>
      )}
    </div>
  );
}

function PrintDaySection({ 
  dayNumber, 
  dayName, 
  plan 
}: { 
  dayNumber: number; 
  dayName: string; 
  plan: WeeklyMealPlanResult['days'][0]['plan'];
}) {
  return (
    <div className="print-day-section">
      <div className="print-day-header">
        <div className="print-day-number">{dayNumber}</div>
        <div className="print-day-info">
          <h3 className="print-day-name">{dayName}</h3>
          <p className="print-day-summary">
            {formatCalories(plan.totalMacros.calories)} kcal | 
            P: {formatMacro(plan.totalMacros.protein)}g | 
            C: {formatMacro(plan.totalMacros.carbs)}g | 
            F: {formatMacro(plan.totalMacros.fat)}g
          </p>
        </div>
      </div>

      <div className="print-meals-grid">
        {MEAL_ORDER.map(mealType => (
          <PrintMealSection 
            key={mealType} 
            mealType={mealType} 
            meal={plan.dailyPlan[mealType]} 
          />
        ))}
      </div>
    </div>
  );
}

export function PrintableMealPlan({ 
  weeklyPlan, 
  clientName,
  generatedDate 
}: PrintableMealPlanProps) {
  return (
    <div className="printable-meal-plan">
      {/* Header */}
      <header className="print-header">
        <h1 className="print-title">Plan Repas Hebdomadaire</h1>
        {clientName && <p className="print-client">Client: {clientName}</p>}
        {generatedDate && <p className="print-date">Généré le: {generatedDate}</p>}
      </header>

      {/* Weekly Summary */}
      <section className="print-weekly-summary">
        <h2 className="print-summary-title">Résumé Hebdomadaire</h2>
        <div className="print-summary-grid">
          <div className="print-summary-item">
            <span className="print-summary-label">Calories/semaine</span>
            <span className="print-summary-value">{formatCalories(weeklyPlan.weeklyTotalMacros.calories)}</span>
            <span className="print-summary-target">Cible: {formatCalories(weeklyPlan.weeklyTargetMacros.calories)}</span>
          </div>
          <div className="print-summary-item">
            <span className="print-summary-label">Protéines</span>
            <span className="print-summary-value">{formatMacro(weeklyPlan.weeklyTotalMacros.protein)}g</span>
            <span className="print-summary-target">Cible: {formatMacro(weeklyPlan.weeklyTargetMacros.protein)}g</span>
          </div>
          <div className="print-summary-item">
            <span className="print-summary-label">Glucides</span>
            <span className="print-summary-value">{formatMacro(weeklyPlan.weeklyTotalMacros.carbs)}g</span>
            <span className="print-summary-target">Cible: {formatMacro(weeklyPlan.weeklyTargetMacros.carbs)}g</span>
          </div>
          <div className="print-summary-item">
            <span className="print-summary-label">Lipides</span>
            <span className="print-summary-value">{formatMacro(weeklyPlan.weeklyTotalMacros.fat)}g</span>
            <span className="print-summary-target">Cible: {formatMacro(weeklyPlan.weeklyTargetMacros.fat)}g</span>
          </div>
        </div>
      </section>

      {/* Daily Plans */}
      <section className="print-days">
        {weeklyPlan.days.map(day => (
          <PrintDaySection 
            key={day.dayNumber}
            dayNumber={day.dayNumber}
            dayName={day.dayName}
            plan={day.plan}
          />
        ))}
      </section>

      {/* Footer */}
      <footer className="print-footer">
        <p>Plan nutritionnel généré par le système de coaching fitness</p>
      </footer>
    </div>
  );
}
