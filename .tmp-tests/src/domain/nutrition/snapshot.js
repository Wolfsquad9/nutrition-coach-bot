"use strict";
/**
 * Plan Snapshot — immutable, fully-resolved representation of a nutrition plan.
 *
 * A snapshot is the single data shape that every distribution channel
 * (PDF, email, shareable link, WhatsApp) operates on.
 *
 * Invariants:
 *  1. A snapshot is always derived from a LOCKED or EXPIRED plan version.
 *  2. Once built, a snapshot is never mutated — exporters receive `Readonly`.
 *  3. `payloadHash` enables integrity verification across channels.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepFreeze = deepFreeze;
exports.validateSnapshotStructure = validateSnapshotStructure;
exports.buildPlanSnapshot = buildPlanSnapshot;
// ============================================================================
// DEEP IMMUTABILITY
// ============================================================================
/**
 * Recursively freeze JSON-compatible snapshot structures.
 * Uses WeakSet cycle protection so accidental object cycles cannot recurse forever.
 */
function deepFreeze(value, seen = new WeakSet()) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
        return value;
    }
    const objectValue = value;
    if (seen.has(objectValue)) {
        return value;
    }
    seen.add(objectValue);
    for (const nestedValue of Object.values(objectValue)) {
        deepFreeze(nestedValue, seen);
    }
    return Object.freeze(value);
}
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isValidDateLike = (value) => {
    if (value instanceof Date)
        return !Number.isNaN(value.getTime());
    return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
};
const requireNonEmptyString = (value, path, errors) => {
    if (!isNonEmptyString(value))
        errors.push(`${path} must be a non-empty string`);
};
const requireFiniteNumber = (value, path, errors) => {
    if (!isFiniteNumber(value))
        errors.push(`${path} must be a finite number`);
};
const requireValidDate = (value, path, errors) => {
    if (!isValidDateLike(value))
        errors.push(`${path} must be a valid date`);
};
const validateMacros = (value, path, errors, fields) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    for (const field of fields)
        requireFiniteNumber(value[field], `${path}.${field}`, errors);
};
const validateStringArray = (value, path, errors) => {
    if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
        return;
    }
    value.forEach((item, index) => {
        if (typeof item !== 'string')
            errors.push(`${path}[${index}] must be a string`);
    });
};
const validateIngredient = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    requireNonEmptyString(value.id, `${path}.id`, errors);
    requireNonEmptyString(value.name, `${path}.name`, errors);
    requireFiniteNumber(value.amount, `${path}.amount`, errors);
    requireNonEmptyString(value.unit, `${path}.unit`, errors);
    requireNonEmptyString(value.category, `${path}.category`, errors);
    validateMacros(value.macrosPer100g, `${path}.macrosPer100g`, errors, ['calories', 'protein', 'carbs', 'fat']);
    if (value.allergens !== undefined)
        validateStringArray(value.allergens, `${path}.allergens`, errors);
    if (value.substitutes !== undefined)
        validateStringArray(value.substitutes, `${path}.substitutes`, errors);
};
const validateRecipe = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    requireNonEmptyString(value.id, `${path}.id`, errors);
    requireNonEmptyString(value.name, `${path}.name`, errors);
    requireNonEmptyString(value.category, `${path}.category`, errors);
    requireFiniteNumber(value.prepTime, `${path}.prepTime`, errors);
    requireFiniteNumber(value.cookTime, `${path}.cookTime`, errors);
    requireFiniteNumber(value.servings, `${path}.servings`, errors);
    validateMacros(value.macrosPerServing, `${path}.macrosPerServing`, errors, ['calories', 'protein', 'carbs', 'fat']);
    if (!Array.isArray(value.ingredients))
        errors.push(`${path}.ingredients must be an array`);
    else
        value.ingredients.forEach((ingredient, index) => validateIngredient(ingredient, `${path}.ingredients[${index}]`, errors));
    validateStringArray(value.instructions, `${path}.instructions`, errors);
    validateStringArray(value.tags, `${path}.tags`, errors);
    validateStringArray(value.dietTypes, `${path}.dietTypes`, errors);
    validateStringArray(value.allergens, `${path}.allergens`, errors);
    validateStringArray(value.equipment, `${path}.equipment`, errors);
    requireNonEmptyString(value.difficulty, `${path}.difficulty`, errors);
};
const validateRecipeServing = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRecipe(value.recipe, `${path}.recipe`, errors);
    requireFiniteNumber(value.servings, `${path}.servings`, errors);
    validateMacros(value.adjustedMacros, `${path}.adjustedMacros`, errors, ['calories', 'protein', 'carbs', 'fat']);
};
const validateMeal = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    requireNonEmptyString(value.id, `${path}.id`, errors);
    requireFiniteNumber(value.mealNumber, `${path}.mealNumber`, errors);
    requireNonEmptyString(value.mealType, `${path}.mealType`, errors);
    requireNonEmptyString(value.time, `${path}.time`, errors);
    validateMacros(value.totalMacros, `${path}.totalMacros`, errors, ['calories', 'protein', 'carbs', 'fat']);
    if (!Array.isArray(value.recipes))
        errors.push(`${path}.recipes must be an array`);
    else
        value.recipes.forEach((recipeServing, index) => validateRecipeServing(recipeServing, `${path}.recipes[${index}]`, errors));
};
const validateWeeklyPlanDay = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    requireFiniteNumber(value.day, `${path}.day`, errors);
    validateMacros(value.totalMacros, `${path}.totalMacros`, errors, ['calories', 'protein', 'carbs', 'fat']);
    requireFiniteNumber(value.hydration, `${path}.hydration`, errors);
    if (!Array.isArray(value.meals))
        errors.push(`${path}.meals must be an array`);
    else
        value.meals.forEach((meal, index) => validateMeal(meal, `${path}.meals[${index}]`, errors));
};
const validateGroceryItem = (value, path, errors) => {
    if (!isRecord(value)) {
        errors.push(`${path} must be an object`);
        return;
    }
    requireNonEmptyString(value.ingredient, `${path}.ingredient`, errors);
    requireFiniteNumber(value.totalAmount, `${path}.totalAmount`, errors);
    requireNonEmptyString(value.unit, `${path}.unit`, errors);
    requireNonEmptyString(value.category, `${path}.category`, errors);
    if (value.estimatedCost !== undefined)
        requireFiniteNumber(value.estimatedCost, `${path}.estimatedCost`, errors);
};
function validateSnapshotStructure(snapshot) {
    const errors = [];
    if (!isRecord(snapshot))
        return { valid: false, errors: ['snapshot must be an object'] };
    if (!isRecord(snapshot.identifier)) {
        errors.push('identifier must be an object');
    }
    else {
        requireNonEmptyString(snapshot.identifier.versionId, 'identifier.versionId', errors);
        requireValidDate(snapshot.identifier.lockedAt, 'identifier.lockedAt', errors);
        requireValidDate(snapshot.identifier.lockedUntil, 'identifier.lockedUntil', errors);
        requireNonEmptyString(snapshot.identifier.payloadHash, 'identifier.payloadHash', errors);
    }
    if (!isRecord(snapshot.client)) {
        errors.push('client must be an object');
    }
    else {
        requireNonEmptyString(snapshot.client.firstName, 'client.firstName', errors);
        requireNonEmptyString(snapshot.client.lastName, 'client.lastName', errors);
        requireNonEmptyString(snapshot.client.goal, 'client.goal', errors);
        requireNonEmptyString(snapshot.client.activityLevel, 'client.activityLevel', errors);
    }
    validateMacros(snapshot.metrics, 'metrics', errors, [
        'tdee', 'bmr', 'targetCalories', 'proteinGrams', 'carbsGrams', 'fatGrams', 'fiberGrams', 'waterLiters',
    ]);
    if (!Array.isArray(snapshot.weeklyPlan))
        errors.push('weeklyPlan must be an array');
    else if (snapshot.weeklyPlan.length === 0)
        errors.push('weeklyPlan must contain at least one day');
    else
        snapshot.weeklyPlan.forEach((day, index) => validateWeeklyPlanDay(day, `weeklyPlan[${index}]`, errors));
    if (!Array.isArray(snapshot.groceryList))
        errors.push('groceryList must be an array');
    else
        snapshot.groceryList.forEach((item, index) => validateGroceryItem(item, `groceryList[${index}]`, errors));
    if (!isRecord(snapshot.meta)) {
        errors.push('meta must be an object');
    }
    else {
        requireNonEmptyString(snapshot.meta.planName, 'meta.planName', errors);
        requireFiniteNumber(snapshot.meta.versionNumber, 'meta.versionNumber', errors);
        requireValidDate(snapshot.meta.createdAt, 'meta.createdAt', errors);
        requireValidDate(snapshot.meta.lockedAt, 'meta.lockedAt', errors);
        requireValidDate(snapshot.meta.lockedUntil, 'meta.lockedUntil', errors);
        requireNonEmptyString(snapshot.meta.generatedBy, 'meta.generatedBy', errors);
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Build an immutable PlanSnapshot from resolved domain data.
 * Pure function — no side effects, no I/O.
 */
function buildPlanSnapshot(input) {
    return deepFreeze({
        identifier: { ...input.identifier },
        client: { ...input.client },
        metrics: { ...input.metrics },
        weeklyPlan: input.weeklyPlan.map(day => ({ ...day })),
        groceryList: input.groceryList.map(item => ({ ...item })),
        meta: {
            planName: input.planName,
            versionNumber: input.versionNumber,
            createdAt: input.createdAt,
            lockedAt: input.identifier.lockedAt.toISOString(),
            lockedUntil: input.identifier.lockedUntil.toISOString(),
            generatedBy: input.generatedBy,
        },
    });
}
