/**
 * useNutritionPlanState - State machine for nutrition plan lifecycle
 * 
 * Integrates with domain lifecycle rules from planLifecycle.ts
 * 
 * Lifecycle States (domain-driven):
 * - EMPTY: No plan exists for client
 * - DRAFT: Plan generated locally, not persisted, freely editable
 * - LOCKED: Plan persisted, immutable for LOCK_DURATION_DAYS
 * - EXPIRED: Lock expired, eligible for new version
 * 
 * UI States (loading overlays):
 * - LOADING: Fetching plan from DB
 * - SAVING: Persisting plan to DB
 * - ERROR: An error occurred
 */

import { useState, useCallback, useMemo } from 'react';
import type { WeeklyMealPlanResult } from '@/services/recipeService';
import {
  checkPlanLockStatus,
  fetchCurrentPlan,
  lockNutritionPlan,
  type PlanPayload,
  type PlanLockStatus,
} from '@/services/supabasePlanService';
import {
  fetchPendingOverrides,
  type PlanOverride,
} from '@/services/supabaseOverrideService';
import {
  fetchPersistedSnapshot,
  persistSnapshot,
  buildAndPersistSnapshot,
} from '@/services/snapshotPersistence';
import { buildPlanSnapshot, type PlanSnapshot, type SnapshotBuildInput } from '@/domain/nutrition/snapshot';
import {
  derivePlanState,
  calculateDaysRemaining,
  calculateLockExpiry,
  canLock as domainCanLock,
  canRegenerate as domainCanRegenerate,
  isImmutable as domainIsImmutable,
  isActionPermitted,
  validateImmutability,
  checkShareability,
  type PlanLifecycleState,
  type PlanStateContext,
  type PlanAction,
} from '@/domain/nutrition/planLifecycle';

// UI overlay states (not lifecycle states)
export type UIState = 'IDLE' | 'LOADING' | 'SAVING' | 'ERROR';

// Legacy PlanState type for backward compatibility
export type PlanState = PlanLifecycleState | 'LOADING' | 'SAVING' | 'ERROR';

export interface NutritionPlanStateContext {
  // Domain lifecycle state (source of truth)
  lifecycleState: PlanLifecycleState;
  
  // UI overlay state
  uiState: UIState;
  
  // Legacy state for backward compatibility
  state: PlanState;
  
  // Plan data (from DB when persisted, from generation when DRAFT)
  weeklyPlan: WeeklyMealPlanResult | null;
  macroTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  likedIngredients: string[];
  
  // Immutable snapshot (canonical source for print/export/share when LOCKED/EXPIRED)
  snapshot: PlanSnapshot | null;
  
  // DB metadata (only present when LOCKED/EXPIRED)
  planId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  planCreatedAt: string | null;
  payloadHash: string | null;
  
  // Lock metadata (derived from domain)
  lockedAt: Date | null;
  lockedUntil: Date | null;
  daysRemaining: number;
  
  // Legacy lock status (for backward compatibility)
  lockStatus: PlanLockStatus;
  pendingOverrides: PlanOverride[];
  
  // Error
  error: string | null;
  
  // Persistence failure tracking
  lastPersistenceFailed: boolean;
  
  // Domain-derived action permissions
  canGenerate: boolean;
  canRegenerate: boolean;
  canLock: boolean;
  canDiscard: boolean;
  canPrint: boolean;
  canShare: boolean;
  isImmutable: boolean;
  isShareable: boolean;
  
  // UI blocking
  isBlocked: boolean;
  
  // Legacy derived booleans (for backward compatibility)
  isEmpty: boolean;
  isDraft: boolean;
  isLocked: boolean;
  isExpired: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isError: boolean;
  isPersisted: boolean;
}

export interface NutritionPlanStateActions {
  // Load plan from DB for a client
  loadPlanForClient: (clientId: string) => Promise<void>;
  
  // Set a draft plan (after generation - NOT persisted)
  setDraftPlan: (
    weeklyPlan: WeeklyMealPlanResult,
    macroTargets: { calories: number; protein: number; carbs: number; fat: number },
    likedIngredients: string[]
  ) => void;
  
  // Lock the current draft (persists to DB and starts lock period)
  lockPlan: (clientId: string) => Promise<{ success: boolean; error: string | null }>;
  
  // Clear all state (on client switch)
  clearState: () => void;
  
  // Reset error state
  clearError: () => void;
  
  // Discard draft and revert to previous state
  discardDraft: (clientId: string) => Promise<void>;
  
  // Check if an action is allowed (uses domain rules)
  isActionAllowed: (action: PlanAction) => boolean;
  
  // Validate immutability for an action
  checkImmutabilityViolation: (action: PlanAction) => { valid: boolean; violation: string | null };
}

export function useNutritionPlanState(): NutritionPlanStateContext & NutritionPlanStateActions {
  // Core state
  const [uiState, setUiState] = useState<UIState>('IDLE');
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [macroTargets, setMacroTargets] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);
  const [likedIngredients, setLikedIngredients] = useState<string[]>([]);
  
  // Immutable snapshot (canonical source for LOCKED/EXPIRED plans)
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  
  // DB metadata
  const [planId, setPlanId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [payloadHash, setPayloadHash] = useState<string | null>(null);
  
  // Lock metadata
  const [lockedAt, setLockedAt] = useState<Date | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  
  // Pending overrides
  const [pendingOverrides, setPendingOverrides] = useState<PlanOverride[]>([]);
  
  // Error and persistence tracking
  const [error, setError] = useState<string | null>(null);
  const [lastPersistenceFailed, setLastPersistenceFailed] = useState(false);

  // Derive lifecycle state from metadata using domain function
  const lifecycleState = useMemo<PlanLifecycleState>(() => {
    return derivePlanState({
      hasPlan: !!weeklyPlan,
      isPersisted: !!versionId,
      lockedAt: lockedAt,
    });
  }, [weeklyPlan, versionId, lockedAt]);

  // Derive days remaining using domain function
  const daysRemaining = useMemo(() => {
    if (!lockedAt) return 0;
    return calculateDaysRemaining(lockedAt);
  }, [lockedAt]);

  // Build plan state context for domain functions
  const planStateContext = useMemo<PlanStateContext>(() => ({
    state: lifecycleState,
    planId,
    versionId,
    versionNumber,
    lockedAt,
    lockedUntil,
    daysRemaining,
    payloadHash,
  }), [lifecycleState, planId, versionId, versionNumber, lockedAt, lockedUntil, daysRemaining, payloadHash]);

  // Domain-derived action permissions
  const canGenerate = useMemo(() => 
    !lastPersistenceFailed && uiState === 'IDLE' && 
    (lifecycleState === 'EMPTY' || lifecycleState === 'EXPIRED'),
    [lastPersistenceFailed, uiState, lifecycleState]
  );

  const canRegenerate = useMemo(() => 
    !lastPersistenceFailed && uiState === 'IDLE' && domainCanRegenerate(lifecycleState),
    [lastPersistenceFailed, uiState, lifecycleState]
  );

  const canLock = useMemo(() => 
    !lastPersistenceFailed && uiState === 'IDLE' && domainCanLock(lifecycleState) && !!weeklyPlan && !!macroTargets,
    [lastPersistenceFailed, uiState, lifecycleState, weeklyPlan, macroTargets]
  );

  const canDiscard = useMemo(() => 
    !lastPersistenceFailed && uiState === 'IDLE' && isActionPermitted(lifecycleState, 'DISCARD'),
    [lastPersistenceFailed, uiState, lifecycleState]
  );

  const canPrint = useMemo(() => 
    isActionPermitted(lifecycleState, 'PRINT'),
    [lifecycleState]
  );

  const canShare = useMemo(() => 
    isActionPermitted(lifecycleState, 'SHARE'),
    [lifecycleState]
  );

  const isImmutable = useMemo(() => 
    domainIsImmutable(lifecycleState),
    [lifecycleState]
  );

  // Shareability check using domain function
  const shareabilityCheck = useMemo(() => 
    checkShareability(planStateContext),
    [planStateContext]
  );
  const isShareable = shareabilityCheck.isShareable;

  // UI state derivations
  const isBlocked = lastPersistenceFailed || uiState === 'ERROR';
  const isEmpty = lifecycleState === 'EMPTY';
  const isDraft = lifecycleState === 'DRAFT';
  const isLocked = lifecycleState === 'LOCKED';
  const isExpired = lifecycleState === 'EXPIRED';
  const isLoading = uiState === 'LOADING';
  const isSaving = uiState === 'SAVING';
  const isError = uiState === 'ERROR';
  const isPersisted = !!versionId;

  // Legacy lock status for backward compatibility
  const lockStatus = useMemo<PlanLockStatus>(() => ({
    isLocked: lifecycleState === 'LOCKED',
    lockedUntil,
    daysRemaining,
  }), [lifecycleState, lockedUntil, daysRemaining]);

  // Compute combined state for backward compatibility
  const state = useMemo<PlanState>(() => {
    if (uiState === 'LOADING') return 'LOADING';
    if (uiState === 'SAVING') return 'SAVING';
    if (uiState === 'ERROR') return 'ERROR';
    return lifecycleState;
  }, [uiState, lifecycleState]);

  // Action permission checker
  const isActionAllowed = useCallback((action: PlanAction): boolean => {
    if (lastPersistenceFailed || uiState !== 'IDLE') return false;
    return isActionPermitted(lifecycleState, action);
  }, [lastPersistenceFailed, uiState, lifecycleState]);

  // Immutability violation checker
  const checkImmutabilityViolation = useCallback((action: PlanAction) => {
    return validateImmutability(lifecycleState, action);
  }, [lifecycleState]);

  /**
   * Load plan from database for a given client
   */
  const loadPlanForClient = useCallback(async (clientId: string) => {
    if (!clientId) {
      setWeeklyPlan(null);
      setMacroTargets(null);
      setLikedIngredients([]);
      setSnapshot(null);
      setPlanId(null);
      setVersionId(null);
      setVersionNumber(null);
      setPlanCreatedAt(null);
      setPayloadHash(null);
      setLockedAt(null);
      setLockedUntil(null);
      setPendingOverrides([]);
      setError(null);
      setUiState('IDLE');
      return;
    }

    setUiState('LOADING');
    setError(null);

    try {
      // Fetch current plan and lock status in parallel
      const [planResult, lockResult] = await Promise.all([
        fetchCurrentPlan(clientId),
        checkPlanLockStatus(clientId),
      ]);

      if (planResult.error) {
        console.error('Error loading plan:', planResult.error);
        setError(planResult.error);
        setUiState('ERROR');
        return;
      }

      if (!planResult.plan) {
        // No plan exists for this client
        setWeeklyPlan(null);
        setMacroTargets(null);
        setLikedIngredients([]);
        setSnapshot(null);
        setPlanId(null);
        setVersionId(null);
        setVersionNumber(null);
        setPlanCreatedAt(null);
        setPayloadHash(null);
        setLockedAt(null);
        setLockedUntil(null);
        setPendingOverrides([]);
        setUiState('IDLE');
        return;
      }

      // Plan exists - hydrate state from DB
      const payload = planResult.plan;
      setWeeklyPlan(payload.weeklyPlan);
      setMacroTargets(payload.macroTargets);
      setLikedIngredients(payload.likedIngredients || []);
      setPlanId(planResult.planId);
      setVersionId(planResult.versionId);
      setPlanCreatedAt(planResult.createdAt);
      
      // Extract lock metadata from payload
      const planLockedAt = payload.lockedAt ? new Date(payload.lockedAt) : null;
      setLockedAt(planLockedAt);
      if (planLockedAt) {
        setLockedUntil(calculateLockExpiry(planLockedAt));
      } else {
        setLockedUntil(lockResult.lockedUntil);
      }

      // Fetch pending overrides and snapshot if we have a version
      if (planResult.versionId) {
        const [overridesResult, snapshotResult] = await Promise.all([
          fetchPendingOverrides(planResult.versionId),
          fetchPersistedSnapshot(planResult.versionId),
        ]);
        if (!overridesResult.error) {
          setPendingOverrides(overridesResult.overrides);
        }
        if (snapshotResult.snapshot) {
          setSnapshot(snapshotResult.snapshot);
        } else {
          // Snapshot missing for a persisted plan — clear it (will be backfilled if client info available)
          setSnapshot(null);
        }
      } else {
        setSnapshot(null);
      }

      setUiState('IDLE');
    } catch (err: any) {
      console.error('Error in loadPlanForClient:', err);
      setError(err.message || 'Failed to load plan');
      setUiState('ERROR');
    }
  }, []);

  /**
   * Set a draft plan (after local generation - NOT persisted to DB)
   */
  const setDraftPlan = useCallback((
    newWeeklyPlan: WeeklyMealPlanResult,
    newMacroTargets: { calories: number; protein: number; carbs: number; fat: number },
    newLikedIngredients: string[]
  ) => {
    // Validate action is allowed
    const validation = validateImmutability(lifecycleState, 'REGENERATE');
    if (!validation.valid) {
      console.warn('Cannot set draft:', validation.violation);
      return;
    }

    setWeeklyPlan(newWeeklyPlan);
    setMacroTargets(newMacroTargets);
    setLikedIngredients(newLikedIngredients);
    // Clear DB metadata since this is a new draft (NOT persisted)
    setPlanId(null);
    setVersionId(null);
    setVersionNumber(null);
    setPlanCreatedAt(null);
    setPayloadHash(null);
    setLockedAt(null);
    setLockedUntil(null);
    setSnapshot(null);
    setError(null);
    setUiState('IDLE');
  }, [lifecycleState]);

  /**
   * Lock the current draft plan - persists to DB and starts lock period
   */
  const lockPlan = useCallback(async (clientId: string): Promise<{ success: boolean; error: string | null }> => {
    // Use domain function to validate
    if (!domainCanLock(lifecycleState) || !weeklyPlan || !macroTargets) {
      return { success: false, error: 'Aucun brouillon à verrouiller' };
    }

    // Validate immutability
    const validation = validateImmutability(lifecycleState, 'LOCK');
    if (!validation.valid) {
      return { success: false, error: validation.violation };
    }

    setUiState('SAVING');
    setError(null);

    try {
      const result = await lockNutritionPlan(
        clientId,
        weeklyPlan,
        macroTargets,
        likedIngredients
      );

      if (!result.success) {
        setLastPersistenceFailed(true);
        setError(result.error);
        setUiState('ERROR');
        return { success: false, error: result.error };
      }

      // Success - clear failure flag
      setLastPersistenceFailed(false);
      
      // Reload from DB to get fresh state with IDs and lock status
      await loadPlanForClient(clientId);
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error locking plan:', err);
      const errorMsg = err.message || 'Échec du verrouillage';
      setLastPersistenceFailed(true);
      setError(errorMsg);
      setUiState('ERROR');
      return { success: false, error: errorMsg };
    }
  }, [lifecycleState, weeklyPlan, macroTargets, likedIngredients, loadPlanForClient]);

  /**
   * Discard draft and revert to previous state
   */
  const discardDraft = useCallback(async (clientId: string) => {
    // Validate action is allowed
    const validation = validateImmutability(lifecycleState, 'DISCARD');
    if (!validation.valid) {
      console.warn('Cannot discard:', validation.violation);
      return;
    }

    if (lifecycleState !== 'DRAFT') return;
    
    // Clear draft data
    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setPlanId(null);
    setVersionId(null);
    setVersionNumber(null);
    setPlanCreatedAt(null);
    setPayloadHash(null);
    setLockedAt(null);
    setLockedUntil(null);
    setError(null);
    
    // Reload from DB (will be EMPTY if no persisted plan, or LOCKED/EXPIRED if one exists)
    await loadPlanForClient(clientId);
  }, [lifecycleState, loadPlanForClient]);

  /**
   * Clear all state (on client switch)
   */
  const clearState = useCallback(() => {
    setWeeklyPlan(null);
    setMacroTargets(null);
    setLikedIngredients([]);
    setSnapshot(null);
    setPlanId(null);
    setVersionId(null);
    setVersionNumber(null);
    setPlanCreatedAt(null);
    setPayloadHash(null);
    setLockedAt(null);
    setLockedUntil(null);
    setPendingOverrides([]);
    setError(null);
    setLastPersistenceFailed(false);
    setUiState('IDLE');
  }, []);

  /**
   * Clear error state and unblock operations
   */
  const clearError = useCallback(() => {
    setError(null);
    setLastPersistenceFailed(false);
    if (uiState === 'ERROR') {
      setUiState('IDLE');
    }
  }, [uiState]);

  return {
    // Domain lifecycle state
    lifecycleState,
    
    // UI state
    uiState,
    
    // Legacy combined state
    state,
    
    // Plan data
    weeklyPlan,
    macroTargets,
    likedIngredients,
    
    // Immutable snapshot (canonical for print/export/share)
    snapshot,
    
    // DB metadata
    planId,
    versionId,
    versionNumber,
    planCreatedAt,
    payloadHash,
    
    // Lock metadata
    lockedAt,
    lockedUntil,
    daysRemaining,
    
    // Legacy
    lockStatus,
    pendingOverrides,
    error,
    lastPersistenceFailed,
    
    // Domain-derived action permissions
    canGenerate,
    canRegenerate,
    canLock,
    canDiscard,
    canPrint,
    canShare,
    isImmutable,
    isShareable,
    
    // UI state
    isBlocked,
    
    // Legacy derived booleans
    isEmpty,
    isDraft,
    isLocked,
    isExpired,
    isLoading,
    isSaving,
    isError,
    isPersisted,
    
    // Actions
    loadPlanForClient,
    setDraftPlan,
    lockPlan,
    clearState,
    clearError,
    discardDraft,
    isActionAllowed,
    checkImmutabilityViolation,
  };
}
