/**
 * Exporter / Importer — JSON export/import of client ingredient
 * restrictions, plus print, PDF, and WhatsApp dispatch for generated
 * plans.
 *
 * Extracted from EnhancedIngredientManager.tsx where five handlers
 * (exportRestrictions, importRestrictions, handlePrintPlan,
 * handleExportPDF, handleSendWhatsApp) were defined inline. They are
 * now grouped under a single hook that takes the state the handlers
 * need to read or write and returns the same functions.
 *
 * Why: these five handlers are the "side effects" of the manager
 * (file downloads, network calls, browser print dialog). Keeping them
 * together makes the data flow easier to follow and gives us a single
 * boundary to test the persistence-related behavior.
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateCompletePlanPDF, downloadPDF } from "@/utils/pdfExport";
import { getClientLabel } from "@/utils/clientHelpers";
import { Client } from "@/types";
import type { ClientIngredientRestrictions } from "@/utils/ingredientSubstitution";
import type { GeneratedDietPlan, GeneratedTrainingPlan } from "./types";
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
  generatedTrainingPlan: GeneratedTrainingPlan | null;
}

export interface UseIngredientExporterResult {
  exportRestrictions: () => void;
  importRestrictions: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePrintPlan: () => void;
  handleExportPDF: () => Promise<void>;
  handleSendWhatsApp: () => Promise<void>;
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
    generatedTrainingPlan,
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

  const handleExportPDF = useCallback(async () => {
    if (!activeClient || !generatedDietPlan || !generatedTrainingPlan) {
      toast({
        title: 'Missing data',
        description: 'Generate a complete plan first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const completePlan = {
        client: activeClient,
        nutritionPlan: {
          metrics: {
            tdee: generatedDietPlan.totalCalories,
            targetCalories: generatedDietPlan.totalCalories,
            proteinGrams: generatedDietPlan.macros.protein,
            carbsGrams: generatedDietPlan.macros.carbs,
            fatGrams: generatedDietPlan.macros.fat,
            fiberGrams: 30,
            waterLiters: 3,
          },
          weeklyMealPlan: generatedDietPlan.meals,
          groceryList: generatedDietPlan.shoppingList || [],
        },
        trainingPlan: generatedTrainingPlan,
      };

      const clientLabel = getClientLabel(activeClient);
      const pdf = generateCompletePlanPDF(
        completePlan as unknown as Parameters<typeof generateCompletePlanPDF>[0]
      );
      downloadPDF(pdf, `${clientLabel.replace(/\s+/g, '_')}_plan.pdf`);

      toast({
        title: 'PDF exported',
        description: 'The plan has been downloaded successfully',
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: 'Export error',
        description: 'Unable to generate PDF',
        variant: 'destructive',
      });
    }
  }, [activeClient, generatedDietPlan, generatedTrainingPlan, toast]);

  const handleSendWhatsApp = useCallback(async () => {
    if (!activeClient || !generatedDietPlan || !generatedTrainingPlan) {
      toast({
        title: 'Missing data',
        description: 'Generate a complete plan first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          clientPhone: activeClient.phone,
          planData: { diet: generatedDietPlan, training: generatedTrainingPlan },
          planType: 'complete',
        },
      });

      if (error) throw error;

      toast({
        title: 'WhatsApp - Ready',
        description: data.note || 'Twilio/Make.com integration required',
      });
    } catch (error) {
      console.error('WhatsApp send error:', error);
      toast({
        title: 'WhatsApp error',
        description: 'Unable to send the plan',
        variant: 'destructive',
      });
    }
  }, [activeClient, generatedDietPlan, generatedTrainingPlan, toast]);

  return {
    exportRestrictions,
    importRestrictions,
    handlePrintPlan,
    handleExportPDF,
    handleSendWhatsApp,
  };
}
