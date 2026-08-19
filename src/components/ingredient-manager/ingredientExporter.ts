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
import type { GeneratedDietPlan } from "./types";
import type { ToastFn } from "./recipeActionHandler";

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
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target?.result as string);
            setClientRestrictions(imported);
            onRestrictionsUpdate(imported);
            toast({
              title: 'Import successful',
              description: 'Restrictions have been imported',
            });
          } catch (error) {
            toast({
              title: 'Import error',
              description: 'Invalid JSON file',
              variant: 'destructive',
            });
          }
        };
        reader.readAsText(file);
      }
    },
    [setClientRestrictions, onRestrictionsUpdate, toast]
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
