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
exports.buildPlanSnapshot = buildPlanSnapshot;
/**
 * Build an immutable PlanSnapshot from resolved domain data.
 * Pure function — no side effects, no I/O.
 */
function buildPlanSnapshot(input) {
    return Object.freeze({
        identifier: Object.freeze({ ...input.identifier }),
        client: Object.freeze({ ...input.client }),
        metrics: Object.freeze({ ...input.metrics }),
        weeklyPlan: Object.freeze(input.weeklyPlan.map(day => Object.freeze({ ...day }))),
        groceryList: Object.freeze(input.groceryList.map(item => Object.freeze({ ...item }))),
        meta: Object.freeze({
            planName: input.planName,
            versionNumber: input.versionNumber,
            createdAt: input.createdAt,
            lockedAt: input.identifier.lockedAt.toISOString(),
            lockedUntil: input.identifier.lockedUntil.toISOString(),
            generatedBy: input.generatedBy,
        }),
    });
}
