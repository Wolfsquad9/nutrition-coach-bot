/**
 * Domain Constants
 * 
 * Central location for business rule constants.
 * These values define core constraints that must be enforced across the application.
 */

// Ingredient validation
export const MIN_LIKED_INGREDIENTS = 5;

// Plan locking
export const LOCK_DURATION_DAYS = 7;

// Macro tolerances (percentage deviation allowed)
export const MACRO_TOLERANCE = {
  CALORIES_PCT: 5,
  PROTEIN_PCT: 5,
  CARBS_PCT: 8,
  FATS_PCT: 8,
} as const;

// Portion constraints (science-based)
export const PORTION_CONSTRAINTS = {
  MAX_PROTEIN_PER_MEAL_G_PER_KG: 0.4, // ~0.4g protein per kg bodyweight per meal
} as const;
