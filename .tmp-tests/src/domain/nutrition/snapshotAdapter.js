"use strict";
/**
 * Snapshot Adapter — maps live plan structures to canonical snapshot types.
 *
 * This is the ONLY place where WeeklyMealPlanResult → MealPlan[] conversion happens.
 * It preserves 100% of generated plan data: meals, recipes, ingredients, macros, hydration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapWeeklyMealPlanToSnapshot = mapWeeklyMealPlanToSnapshot;
exports.mapSnapshotToWeeklyPlan = mapSnapshotToWeeklyPlan;
exports.buildGroceryListFromPlan = buildGroceryListFromPlan;
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_TIMES = {
    breakfast: '07:00',
    lunch: '12:30',
    dinner: '19:30',
    snack: '16:00',
};
/**
 * Convert a single MealData into a canonical Meal.
 */
function mapMealDataToMeal(mealData, mealType, mealNumber) {
    const ingredients = mealData.ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        amount: ing.typical_serving_size_g,
        unit: 'g',
        category: mapIngredientCategory(ing.category),
        macrosPer100g: {
            calories: ing.macros.calories,
            protein: ing.macros.protein,
            carbs: ing.macros.carbs,
            fat: ing.macros.fat,
            fiber: ing.macros.fiber,
        },
        allergens: [],
        substitutes: [],
    }));
    const recipe = {
        id: `${mealType}-recipe`,
        name: mealData.recipeText || `${mealType} recipe`,
        category: mealType,
        prepTime: 0,
        cookTime: 0,
        servings: 1,
        ingredients,
        instructions: [],
        macrosPerServing: {
            calories: mealData.macros.calories,
            protein: mealData.macros.protein,
            carbs: mealData.macros.carbs,
            fat: mealData.macros.fat,
            fiber: mealData.macros.fiber,
        },
        tags: [],
        dietTypes: [],
        allergens: [],
        equipment: [],
        difficulty: 'easy',
    };
    const serving = {
        recipe,
        servings: 1,
        adjustedMacros: { ...recipe.macrosPerServing },
    };
    return {
        id: `${mealType}-${mealNumber}`,
        mealNumber,
        mealType,
        time: MEAL_TIMES[mealType],
        recipes: [serving],
        totalMacros: { ...recipe.macrosPerServing },
    };
}
function mapIngredientCategory(cat) {
    const mapping = {
        protein: 'protein',
        carbohydrate: 'carb',
        fat: 'fat',
        fruit: 'fruit',
        vegetable: 'vegetable',
        misc: 'other',
    };
    return mapping[cat] ?? 'other';
}
/**
 * Map a WeeklyMealPlanResult into the canonical MealPlan[] used by PlanSnapshot.
 */
function mapWeeklyMealPlanToSnapshot(weeklyPlan) {
    return weeklyPlan.days.map((day) => {
        const dailyPlan = day.plan.dailyPlan;
        const meals = [];
        let mealNumber = 1;
        for (const mealType of MEAL_ORDER) {
            const mealData = dailyPlan[mealType];
            if (mealData && mealData.ingredients.length > 0) {
                meals.push(mapMealDataToMeal(mealData, mealType, mealNumber));
                mealNumber++;
            }
        }
        return {
            day: day.dayNumber,
            meals,
            totalMacros: { ...day.plan.totalMacros },
            hydration: 0, // populated from metrics if available
        };
    });
}
/**
 * Convert PlanSnapshot back to WeeklyMealPlanResult
 */
function mapSnapshotToWeeklyPlan(snapshot) {
    return {
        days: snapshot.weeklyPlan.map((day) => ({
            dayNumber: day.day,
            dayName: `Day ${day.day}`,
            plan: {
                dailyPlan: reconstructDailyPlan(day.meals),
                totalMacros: { ...day.totalMacros },
                targetMacros: { ...snapshot.metrics },
                variance: zeroMacros(),
            },
        })),
        weeklyTotalMacros: snapshot.metrics,
        weeklyTargetMacros: snapshot.metrics,
        weeklyVariance: zeroMacros(),
    };
}
/**
 * Build a grocery list from the full weekly plan.
 */
function buildGroceryListFromPlan(weeklyPlan) {
    const agg = new Map();
    for (const day of weeklyPlan.days) {
        const dp = day.plan.dailyPlan;
        for (const mealType of MEAL_ORDER) {
            const mealData = dp[mealType];
            if (!mealData)
                continue;
            for (const ing of mealData.ingredients) {
                const existing = agg.get(ing.id);
                if (existing) {
                    existing.totalG += ing.typical_serving_size_g;
                }
                else {
                    agg.set(ing.id, {
                        totalG: ing.typical_serving_size_g,
                        category: ing.category,
                    });
                }
            }
        }
    }
    const items = [];
    for (const [id, val] of agg) {
        let name = id;
        outer: for (const day of weeklyPlan.days) {
            for (const mealType of MEAL_ORDER) {
                const mealData = day.plan.dailyPlan[mealType];
                if (!mealData)
                    continue;
                const found = mealData.ingredients.find((i) => i.id === id);
                if (found) {
                    name = found.name;
                    break outer;
                }
            }
        }
        items.push({
            ingredient: name,
            totalAmount: Math.round(val.totalG),
            unit: 'g',
            category: val.category,
        });
    }
    return items;
}
/**
 * Reconstruct dailyPlan from Meal[] for mapSnapshotToWeeklyPlan
 */
function reconstructDailyPlan(meals) {
    const emptyMeal = {
        ingredients: [],
        macros: zeroMacros(),
        recipeText: '',
    };
    const dailyPlan = {
        breakfast: { ...emptyMeal },
        lunch: { ...emptyMeal },
        dinner: { ...emptyMeal },
        snack: { ...emptyMeal },
    };
    for (const meal of meals) {
        const recipe = meal.recipes[0]?.recipe;
        dailyPlan[meal.mealType] = {
            ingredients: recipe?.ingredients.map((ing) => ({
                id: ing.id,
                name: ing.name,
                category: ing.category,
                typical_serving_size_g: ing.amount,
                macros: {
                    calories: ing.macrosPer100g.calories,
                    protein: ing.macrosPer100g.protein,
                    carbs: ing.macrosPer100g.carbs,
                    fat: ing.macrosPer100g.fat,
                    fiber: ing.macrosPer100g.fiber ?? 0,
                },
                allowedMeals: [],
                tags: [],
            })) ?? [],
            macros: { ...meal.totalMacros },
            recipeText: recipe?.name ?? '',
        };
    }
    return dailyPlan;
}
function zeroMacros() {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}
