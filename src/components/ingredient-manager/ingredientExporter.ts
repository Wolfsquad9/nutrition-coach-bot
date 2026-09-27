/**
 * Exporter / Importer — JSON export/import of client ingredient
 * restrictions, plus print support for generated plans.
 *
 * Extracted from EnhancedIngredientManager.tsx where several handlers
 * (exportRestrictions, importRestrictions, handlePrintPlan) were defined
 * inline. They are now grouped under a single hook that takes the state
 * the handlers need to read or write and returns the same functions.
 *
 * Why: these handlers are the "side effects" of the manager
 * (file downloads, browser print dialog). Keeping them together makes
 * the data flow easier to follow and gives us a single boundary to test.
 */

import { useCallback } from "react";
import type { Client } from "@/types";
import type { ClientIngredientRestrictions } from "@/utils/ingredientSubstitution";
import { coreIngredients } from "@/data/ingredientDatabase";
import type { GeneratedDietPlan } from "./types";
import type { ToastFn } from "./recipeActionHandler";
import { validateImportedRestrictions, formatRestrictionImportErrors } from "./restrictionImport";

export interface UseIngredientExporterArgs {
  // Restrictions I/O
  clientRestrictions: ClientIngredientRestrictions[];
  setClientRestrictions: (next: ClientIngredientRestrictions[]) => void;
  onRestrictionsUpdate: (restrictions: ClientIngredientRestrictions[]) => void;
  toast: ToastFn;

  // Plan dispatch
  activeClient: Client | null;
  generatedDietPlan: GeneratedDietPlan | null;
}

export interface UseIngredientExporterResult {
  exportRestrictions: () => void;
  importRestrictions: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePrintPlan: () => void;
}

export function useIngredientExporter(
  args: UseIngredientExporterArgs
): UseIngredientExporterResult {
  const {
    clientRestrictions,
    setClientRestrictions,
    onRestrictionsUpdate,
    toast,
    activeClient,
    generatedDietPlan,
  } = args;

  const exportRestrictions = useCallback(() => {
    const dataStr = JSON.stringify(clientRestrictions, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `client_restrictions_${Date.now()}.json`);
    linkElement.click();

    toast({
      title: 'Export successful',
      description: 'Restrictions have been exported as JSON',
    });
  }, [clientRestrictions, toast]);

  const importRestrictions = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      // Allow re-selecting the same file after a rejected import.
      input.value = '';
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.target?.result as string);
        } catch {
          toast({
            title: 'Import error',
            description: 'Invalid JSON file',
            variant: 'destructive',
          });
          return;
        }

        // Fail closed: never write unvalidated restriction data into state.
        const result = validateImportedRestrictions(parsed, {
          knownIngredientIds: coreIngredients.map((ingredient) => ingredient.id),
          expectedClientId: activeClient?.id ?? null,
        });

        if (!result.ok) {
          toast({
            title: 'Import rejected',
            description: formatRestrictionImportErrors(result.errors),
            variant: 'destructive',
          });
          return;
        }

        setClientRestrictions(result.restrictions);
        onRestrictionsUpdate(result.restrictions);
        toast({
          title: 'Import successful',
          description: 'Restrictions have been imported',
        });
      };
      reader.readAsText(file);
    },
    [activeClient, setClientRestrictions, onRestrictionsUpdate, toast]
  );

  const handlePrintPlan = useCallback(() => {
    window.print();
    toast({
      title: 'Print started',
      description: 'The plan is ready to print',
    });
  }, [toast]);

  return {
    exportRestrictions,
    importRestrictions,
    handlePrintPlan,
  };
}
