"use strict";
/**
 * Domain Constants
 *
 * Central location for business rule constants.
 * These values define core constraints that must be enforced across the application.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORTION_CONSTRAINTS = exports.MACRO_TOLERANCE = exports.LOCK_DURATION_DAYS = exports.MIN_LIKED_INGREDIENTS = void 0;
// Ingredient validation
exports.MIN_LIKED_INGREDIENTS = 5;
// Plan locking
exports.LOCK_DURATION_DAYS = 7;
// Macro tolerances (percentage deviation allowed)
exports.MACRO_TOLERANCE = {
    CALORIES_PCT: 5,
    PROTEIN_PCT: 5,
    CARBS_PCT: 8,
    FATS_PCT: 8,
};
// Portion constraints (science-based)
exports.PORTION_CONSTRAINTS = {
    MAX_PROTEIN_PER_MEAL_G_PER_KG: 0.4, // ~0.4g protein per kg bodyweight per meal
};
