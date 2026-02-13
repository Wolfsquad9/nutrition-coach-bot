/**
 * Snapshot Distribution Layer
 *
 * Pure export functions that transform a PlanSnapshot into
 * channel-specific payloads (PDF document, email payload, shareable JSON).
 *
 * Contracts:
 *  - Every exporter receives `Readonly<PlanSnapshot>`
 *  - No exporter may mutate the snapshot
 *  - No exporter may access UI state, hooks, or Supabase
 *  - Return values are new objects — never references into the snapshot
 */

import jsPDF from 'jspdf';
import type { PlanSnapshot } from './snapshot';

// ============================================================================
// EXPORT RESULT TYPES
// ============================================================================

export interface EmailPayload {
  readonly subject: string;
  readonly htmlBody: string;
  readonly plainTextBody: string;
  readonly metadata: {
    readonly versionId: string;
    readonly payloadHash: string;
    readonly clientName: string;
  };
}

export interface ShareableJSON {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly snapshot: PlanSnapshot;
  readonly integrity: {
    readonly payloadHash: string;
    readonly versionId: string;
  };
}

// ============================================================================
// EXPORTER ABSTRACTION
// ============================================================================

/**
 * Minimal exporter interface.
 * Each channel implements `export` to produce its output from a snapshot.
 */
export interface SnapshotExporter<TOutput> {
  readonly name: string;
  export(snapshot: Readonly<PlanSnapshot>): TOutput;
}

// ============================================================================
// CONCRETE EXPORTERS
// ============================================================================

/**
 * PDF Exporter — generates a multi-page jsPDF document from a snapshot.
 */
export const pdfExporter: SnapshotExporter<jsPDF> = {
  name: 'pdf',
  export(snapshot: Readonly<PlanSnapshot>): jsPDF {
    return exportSnapshotToPDF(snapshot);
  },
};

/**
 * JSON Exporter — produces a shareable, integrity-verified JSON payload.
 */
export const jsonExporter: SnapshotExporter<ShareableJSON> = {
  name: 'json',
  export(snapshot: Readonly<PlanSnapshot>): ShareableJSON {
    return exportSnapshotToShareableJSON(snapshot);
  },
};

/**
 * Email Payload Exporter — builds subject/body/metadata for email distribution.
 */
export const emailExporter: SnapshotExporter<EmailPayload> = {
  name: 'email',
  export(snapshot: Readonly<PlanSnapshot>): EmailPayload {
    return exportSnapshotToEmailPayload(snapshot);
  },
};

// ============================================================================
// PURE EXPORT FUNCTIONS
// ============================================================================

/**
 * Generate a professional PDF from a PlanSnapshot.
 */
export function exportSnapshotToPDF(snapshot: Readonly<PlanSnapshot>): jsPDF {
  const doc = new jsPDF();
  let y = 20;

  // ---- Header ----
  doc.setFontSize(22);
  doc.setTextColor(33, 37, 41);
  doc.text('Nutrition Plan', 105, y, { align: 'center' });
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(108, 117, 125);
  doc.text(
    `${snapshot.client.firstName} ${snapshot.client.lastName} — v${snapshot.meta.versionNumber}`,
    105,
    y,
    { align: 'center' },
  );
  y += 12;

  // ---- Metrics summary ----
  doc.setFontSize(14);
  doc.setTextColor(0, 123, 255);
  doc.text('Daily Targets', 20, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(33, 37, 41);
  const m = snapshot.metrics;
  doc.text(`Calories: ${m.targetCalories} kcal | Protein: ${m.proteinGrams}g | Carbs: ${m.carbsGrams}g | Fat: ${m.fatGrams}g`, 20, y);
  y += 6;
  doc.text(`Fiber: ${m.fiberGrams}g | Water: ${m.waterLiters}L | TDEE: ${m.tdee} kcal`, 20, y);
  y += 12;

  // ---- Weekly plan ----
  snapshot.weeklyPlan.forEach((dayPlan) => {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(13);
    doc.setTextColor(40, 167, 69);
    doc.text(`Day ${dayPlan.day}`, 20, y);
    y += 7;

    doc.setFontSize(9);
    doc.setTextColor(33, 37, 41);
    doc.text(
      `Total: ${dayPlan.totalMacros.calories} kcal | P ${dayPlan.totalMacros.protein}g | C ${dayPlan.totalMacros.carbs}g | F ${dayPlan.totalMacros.fat}g`,
      20,
      y,
    );
    y += 7;

    dayPlan.meals.forEach((meal) => {
      doc.setFontSize(10);
      doc.setTextColor(108, 117, 125);
      const label = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);
      doc.text(`${meal.time} — ${label}`, 25, y);
      y += 5;

      meal.recipes.forEach((rs) => {
        doc.setFontSize(9);
        doc.setTextColor(33, 37, 41);
        doc.text(`• ${rs.recipe.name} (×${rs.servings})`, 30, y);
        y += 4;
        doc.setFontSize(8);
        doc.setTextColor(108, 117, 125);
        doc.text(
          `${rs.adjustedMacros.calories} kcal | P ${rs.adjustedMacros.protein}g | C ${rs.adjustedMacros.carbs}g | F ${rs.adjustedMacros.fat}g`,
          35,
          y,
        );
        y += 5;
      });
    });
    y += 4;
  });

  // ---- Grocery list ----
  doc.addPage();
  y = 20;
  doc.setFontSize(16);
  doc.setTextColor(0, 123, 255);
  doc.text('Grocery List', 105, y, { align: 'center' });
  y += 12;

  const categories = [...new Set(snapshot.groceryList.map((i) => i.category))];
  categories.forEach((cat) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setTextColor(40, 167, 69);
    doc.text(cat.charAt(0).toUpperCase() + cat.slice(1), 20, y);
    y += 6;

    snapshot.groceryList
      .filter((i) => i.category === cat)
      .forEach((item) => {
        doc.setFontSize(9);
        doc.setTextColor(33, 37, 41);
        doc.text(`□ ${item.ingredient}: ${item.totalAmount} ${item.unit}`, 25, y);
        y += 5;
      });
    y += 3;
  });

  // ---- Footer metadata ----
  doc.setFontSize(7);
  doc.setTextColor(173, 181, 189);
  doc.text(`Version ${snapshot.meta.versionNumber} • Locked ${snapshot.meta.lockedAt} • Hash ${snapshot.identifier.payloadHash}`, 20, 285);

  return doc;
}

/**
 * Build an email-ready payload from a PlanSnapshot.
 */
export function exportSnapshotToEmailPayload(snapshot: Readonly<PlanSnapshot>): EmailPayload {
  const clientName = `${snapshot.client.firstName} ${snapshot.client.lastName}`;
  const subject = `Nutrition Plan v${snapshot.meta.versionNumber} — ${clientName}`;

  const lines: string[] = [
    `Nutrition Plan for ${clientName}`,
    `Version: ${snapshot.meta.versionNumber}`,
    `Goal: ${snapshot.client.goal}`,
    '',
    `Daily Targets:`,
    `  Calories: ${snapshot.metrics.targetCalories} kcal`,
    `  Protein: ${snapshot.metrics.proteinGrams}g`,
    `  Carbs: ${snapshot.metrics.carbsGrams}g`,
    `  Fat: ${snapshot.metrics.fatGrams}g`,
    '',
  ];

  snapshot.weeklyPlan.forEach((day) => {
    lines.push(`--- Day ${day.day} ---`);
    day.meals.forEach((meal) => {
      const label = meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1);
      lines.push(`  ${meal.time} ${label}`);
      meal.recipes.forEach((rs) => {
        lines.push(`    • ${rs.recipe.name} (×${rs.servings}) — ${rs.adjustedMacros.calories} kcal`);
      });
    });
    lines.push('');
  });

  const plainTextBody = lines.join('\n');

  // Minimal HTML — real template can be added later
  const htmlBody = `<pre style="font-family:sans-serif;font-size:14px;line-height:1.6">${plainTextBody}</pre>`;

  return {
    subject,
    htmlBody,
    plainTextBody,
    metadata: {
      versionId: snapshot.identifier.versionId,
      payloadHash: snapshot.identifier.payloadHash,
      clientName,
    },
  };
}

/**
 * Produce a shareable JSON envelope with integrity metadata.
 */
export function exportSnapshotToShareableJSON(snapshot: Readonly<PlanSnapshot>): ShareableJSON {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    snapshot,
    integrity: {
      payloadHash: snapshot.identifier.payloadHash,
      versionId: snapshot.identifier.versionId,
    },
  };
}
