/**
 * Restriction manager — encapsulates the four operations on a client's
 * ingredient restrictions (per-client blocked + preferred + substitution
 * matrix).
 *
 * Extracted from EnhancedIngredientManager.tsx where the four helpers
 * were defined inline and captured component state via closures. They
 * are now a custom hook that takes the same state + setters and
 * returns the same functions. Behavior is identical: a call to
 * toggleIngredientStatus still mutates the parent's clientRestrictions
 * state via the setter passed in.
 *
 * State ownership stays with the parent component. This hook only
 * organizes the operations.
 */

import { useCallback } from "react";
import {
  generateSubstitutionMatrix,
  type ClientIngredientRestrictions,
  type SubstitutionRule,
} from "@/utils/ingredientSubstitution";
import { coreIngredients } from "@/data/ingredientDatabase";
import { Client } from "@/types";
import { getClientLabel } from "@/utils/clientHelpers";
import type { IngredientStatus } from "./types";

const EMPTY_RESTRICTION: ClientIngredientRestrictions = {
  clientId: '',
  clientName: '',
  blockedIngredients: [],
  preferredIngredients: [],
  substitutionRules: {},
};

export interface UseRestrictionManagerArgs {
  activeClientId: string | null;
  activeClient: Client | null;
  clientRestrictions: ClientIngredientRestrictions[];
  setClientRestrictions: (next: ClientIngredientRestrictions[]) => void;
  setSubstitutionMatrix: (next: Map<string, SubstitutionRule[]>) => void;
  autoSubstitute: boolean;
  onRestrictionsUpdate: (restrictions: ClientIngredientRestrictions[]) => void;
}

export interface UseRestrictionManagerResult {
  getClientRestriction: (clientId: string | null) => ClientIngredientRestrictions;
  toggleIngredientStatus: (ingredientId: string, status: IngredientStatus) => void;
  getIngredientStatus: (ingredientId: string) => IngredientStatus;
  updateSubstitutionMatrix: (restriction: ClientIngredientRestrictions) => void;
}

export function useRestrictionManager(
  args: UseRestrictionManagerArgs
): UseRestrictionManagerResult {
  const {
    activeClientId,
    activeClient,
    clientRestrictions,
    setClientRestrictions,
    setSubstitutionMatrix,
    autoSubstitute,
    onRestrictionsUpdate,
  } = args;

  const getClientRestriction = useCallback(
    (clientId: string | null): ClientIngredientRestrictions => {
      if (!clientId) {
        return { ...EMPTY_RESTRICTION };
      }
      return (
        clientRestrictions.find((r) => r.clientId === clientId) || {
          ...EMPTY_RESTRICTION,
          clientId,
          clientName: activeClient ? getClientLabel(activeClient) : '',
        }
      );
    },
    [activeClient, clientRestrictions]
  );

  const toggleIngredientStatus = useCallback(
    (ingredientId: string, status: IngredientStatus) => {
      if (!activeClientId) return;

      const currentRestriction = getClientRestriction(activeClientId);
      const newRestriction = { ...currentRestriction };

      newRestriction.blockedIngredients = newRestriction.blockedIngredients.filter(
        (id) => id !== ingredientId
      );
      newRestriction.preferredIngredients = newRestriction.preferredIngredients.filter(
        (id) => id !== ingredientId
      );

      if (status === 'blocked') {
        newRestriction.blockedIngredients.push(ingredientId);
      } else if (status === 'preferred') {
        newRestriction.preferredIngredients.push(ingredientId);
      }

      const newRestrictions = clientRestrictions.filter((r) => r.clientId !== activeClientId);
      newRestrictions.push(newRestriction);
      setClientRestrictions(newRestrictions);
      onRestrictionsUpdate(newRestrictions);

      if (autoSubstitute && status === 'blocked') {
        const matrix = generateSubstitutionMatrix(
          newRestriction.blockedIngredients,
          newRestriction
        );
        setSubstitutionMatrix(matrix);
      }
    },
    [
      activeClientId,
      autoSubstitute,
      clientRestrictions,
      getClientRestriction,
      onRestrictionsUpdate,
      setClientRestrictions,
      setSubstitutionMatrix,
    ]
  );

  const getIngredientStatus = useCallback(
    (ingredientId: string): IngredientStatus => {
      if (!activeClientId) return 'neutral';
      const restriction = getClientRestriction(activeClientId);
      if (restriction.blockedIngredients.includes(ingredientId)) return 'blocked';
      if (restriction.preferredIngredients.includes(ingredientId)) return 'preferred';
      return 'neutral';
    },
    [activeClientId, getClientRestriction]
  );

  const updateSubstitutionMatrix = useCallback(
    (restriction: ClientIngredientRestrictions) => {
      const matrix = generateSubstitutionMatrix(
        restriction.blockedIngredients,
        restriction
      );
      setSubstitutionMatrix(matrix);
    },
    [setSubstitutionMatrix]
  );

  return {
    getClientRestriction,
    toggleIngredientStatus,
    getIngredientStatus,
    updateSubstitutionMatrix,
  };
}

// Re-export so the parent component doesn't need to know whether it
// should compute the matrix inline (it shouldn't — that path stays here).
export { coreIngredients };