# Core Ingredient Database

## Overview
50 essential ingredients structured for dynamic recipe generation, covering all macronutrient categories with complete nutritional data and smart tagging system.

## Structure
```json
{
  "id": "unique-identifier",
  "name": "Display Name",
  "category": "protein|carbohydrate|fat|fruit|vegetable|misc",
  "macros_per_100g": {
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "kcal": 0,
    "fiber": 0 // optional
  },
  "key_micros": ["vitamin/mineral list"],
  "typical_serving_size_g": 0,
  "tags": ["dietary", "budget", "characteristics"]
}
```

## Categories Breakdown
- **Proteins (10)**: Lean meats, fish, plant-based, dairy - covering 8-31g protein/100g
- **Carbohydrates (8)**: Whole grains, tubers, legumes - emphasizing complex carbs with fiber
- **Fats (8)**: Healthy oils, nuts, seeds - balanced omega-3/6, monounsaturated focus
- **Fruits (6)**: Common, affordable options rich in vitamins and antioxidants
- **Vegetables (10)**: Nutrient-dense, low-calorie options covering all key micronutrients
- **Misc (8)**: Herbs, spices, flavor enhancers with minimal caloric impact

## Smart Features
- **Tag-based filtering**: vegetarian, vegan, budget, high-protein, gluten-free, etc.
- **Macro calculations**: Helper functions for serving size adjustments
- **Nutritional queries**: Find ingredients by protein/carb/fat/calorie criteria
- **Category grouping**: Quick access to ingredient subsets

## Integration
Import and use:
```typescript
import { coreIngredients, getIngredientsByCategory, calculateMacros } from '@/data/ingredientDatabase';

// Get all proteins
const proteins = getIngredientsByCategory('protein');

// Calculate macros for 200g chicken
const chickenMacros = calculateMacros(chickenIngredient, 200);
```

Ready for immediate integration with recipe generation algorithms.