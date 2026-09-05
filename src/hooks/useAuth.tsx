/**
 * Authentication hook for Supabase — email/password auth.
 * SINGLE SOURCE OF TRUTH for:
 *   - authenticated user (auth.users)
 *   - application role (from user_roles table ONLY)
 *   - resolved clientId (from clients table ONLY)
 *
 * STABILIZED design:
 *   - Database is the ONLY source for role and clientId
 *   - JWT metadata is NOT used for role or clientId
 *   - isLoading is the only loading gate (no isReady)
 *   - refreshAuthState() is exposed for explicit re-fetch after claim
 *   - No background refresh races, no two-phase resolution
 *
 * Pages must only consume via useAuth().
 */

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  userRole: 'coach' | 'client' | null;
  isClient: boolean;
  isCoach: boolean;
  clientId: string | null;
  /** Re-fetch role and clientId from database. Call after invitation claim. */
  refreshAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userId: null,
  isLoading: true,
  isAuthenticated: false,
  signOut: async () => {},
  userRole: null,
  isClient: false,
  isCoach: false,
  clientId: null,
  refreshAuthState: async () => {},
});

/**
 * Result of an auth-state lookup. The field semantics are the Phase 12 safety
 * contract (flat shape — this project compiles with strictNullChecks off, so
 * no discriminated-union narrowing is relied upon):
 *   - ok: true  -> lookup SUCCEEDED. value === null means the row is genuinely
 *     absent (a valid authorization answer: "no role"). error is null.
 *   - ok: false -> lookup FAILED (network/server) after retries. value is
 *     UNKNOWN (kept null here), never "absent", so the caller must retain the
 *     previous auth-derived state instead of wiping it. error is set.
 */
interface LookupOutcome<T> {
  ok: boolean;
  value: T | null;
  error: unknown;
}

/**
 * Transient lookup failures (network blips, DNS hiccups, momentary gateway
 * errors) are retried before being surfaced. supabase-js resolves fetch
 * failures to `{ data: null, error }` instead of throwing, which without
 * retries would be indistinguishable from a missing row — the exact mechanism
 * that logged users out when a TOKEN_REFRESHED re-resolution hit a network
 * blip. The window (~5s) absorbs short bursts; a persistent outage still ends
 * in the fail-safe path (unresolved role -> ProtectedRoute requires sign-in).
 * Retries only ever run while the query is already failing, so the happy-path
 * cost is zero.
 */
const LOOKUP_MAX_ATTEMPTS = 5;
const LOOKUP_RETRY_DELAY_MS = 1000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function lookupWithRetry<T>(
  label: string,
  attempt: () => Promise<{ data: T | null; error: { message?: string } | null }>,
): Promise<LookupOutcome<T>> {
  let lastError: unknown = null;
  for (let attemptNo = 1; attemptNo <= LOOKUP_MAX_ATTEMPTS; attemptNo += 1) {
    let result: { data: T | null; error: { message?: string } | null };
    try {
      result = await attempt();
    } catch (err) {
      // Rejected promises get the same retry treatment as resolved errors.
      result = { data: null, error: { message: String(err) } };
    }
    const { data, error } = result;
    if (!error) {
      if (attemptNo > 1) {
        console.log(`[AUTH] ${label} lookup recovered on attempt ${attemptNo}`);
      }
      return { ok: true, value: data, error: null };
    }
    lastError = error;
    console.warn(
      `[AUTH] ⚠️ ${label} lookup attempt ${attemptNo}/${LOOKUP_MAX_ATTEMPTS} failed:`,
      error,
    );
    if (attemptNo < LOOKUP_MAX_ATTEMPTS) await delay(LOOKUP_RETRY_DELAY_MS);
  }
  return { ok: false, value: null, error: lastError };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'coach' | 'client' | null>(null);
  // Track user.id in a ref so refreshAuthState always reads the latest value,
  // even when called from an event handler that hasn't re-rendered yet.
  const userIdRef = useRef<string | null>(null);

  // Sync the ref with state on every render so it is always current.
  userIdRef.current = user?.id ?? null;

  /**
   * Fetch role from user_roles and clientId from clients (sequentially, so
   * each lookup is independently observable). This is the ONLY code path for
   * resolving auth-derived state.
   *
   * Failure contract (Phase 12 auth resilience):
   *   - lookup ok + row found        -> state set from the row
   *   - lookup ok + no row           -> genuinely absent: state set to null
   *   - lookup failed after retries  -> TRANSIENT infrastructure failure:
   *     the last-known valid state is RETAINED (never wiped), so a network
   *     blip during a TOKEN_REFRESHED re-resolution cannot log the user out.
   *     A persistent failure still ends with the pre-existing state, which
   *     ProtectedRoute treats safely (initial state = null role -> sign-in).
   */
  const resolveAuthState = useCallback(async (uid: string) => {
    console.log('[DEBUG] resolveAuthState START, uid:', uid);

    // SEQUENTIAL AWAITS: Each query is isolated so the browser Network tab
    // shows exactly which HTTP request (if any) never completes.
    console.log('[AUTH] ⏳ user_roles query START');
    const roleLookup = await lookupWithRetry<{
      role: 'client' | 'trainer' | 'admin';
    }>('user_roles', async () => {
      const result = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle();
      return {
        data: (result.data as { role: 'client' | 'trainer' | 'admin' } | null) ?? null,
        error: result.error,
      };
    });
    if (!roleLookup.ok) {
      // Role is UNKNOWN, not "absent": keep the last-known valid role and
      // leave clientId untouched as well — this re-resolution made no change.
      console.error(
        '[AUTH] ❌ user_roles lookup failed after retries; retaining last-known role',
        roleLookup.error,
      );
      return;
    }
    const roleData = roleLookup.value;
    console.log('[AUTH] ✅ user_roles query DONE', roleData ? 'found' : 'not found');

    console.log('[AUTH] ⏳ clients query START');
    const clientLookup = await lookupWithRetry<{ id: string }>('clients', async () => {
      const result = await supabase
        .from('clients')
        .select('id')
        .eq('user_profile_id', uid)
        .maybeSingle();
      return { data: (result.data as { id: string } | null) ?? null, error: result.error };
    });
    if (!clientLookup.ok) {
      // clientId is UNKNOWN, not "absent": retain the last-known value.
      console.error(
        '[AUTH] ❌ clients lookup failed after retries; retaining last-known clientId',
        clientLookup.error,
      );
    } else {
      setClientId(clientLookup.value?.id ?? null);
      console.log('[AUTH] ✅ clients query DONE', clientLookup.value ? 'found' : 'not found');
    }

    console.log('[DEBUG] resolveAuthState DONE');
    // Map DB role ('trainer') to frontend role ('coach'); null only after a
    // SUCCESSFUL query that found no row (genuine absence, never an error).
    const dbRole = roleData?.role;
    const mappedRole: 'coach' | 'client' | null =
      dbRole === 'client' ? 'client' :
      dbRole === 'trainer' ? 'coach' :
      null;

    setUserRole(mappedRole);
  }, []);

  /**
   * Public method for pages to call after invitation claim mutates the DB.
   * Re-fetches role and clientId, updates state.
   * Uses userIdRef instead of `user?.id` from closure so that calls from
   * event handlers that haven't re-rendered still see the latest user id.
   */
  const refreshAuthState = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await resolveAuthState(uid);
  }, [resolveAuthState]);

  /**
   * Handle an auth state change event.
   * Single resolution path: read from DB, set isLoading=false when done.
   * Wrapped in try/finally so a rejection in resolveAuthState cannot leave
   * isLoading stuck at true (which would cause an infinite spinner).
   *
   * The listener and the initial getSession().then both call this; they are
   * allowed to run in parallel and each clears isLoading in its own finally.
   * That double-resolution is wasteful but correct — coalescing them with an
   * in-flight guard drops legitimate auth events (SIGNED_OUT followed by
   * SIGNED_IN from signInWithPassword) and leaves the SPA holding the wrong
   * session.
   */
  const handleAuthChange = useCallback(async (currentSession: Session | null) => {
    console.log('[DEBUG] handleAuthChange CALLED, hasSession:', !!currentSession);
    try {
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // Single resolution: read from database, no metadata fallback
        await resolveAuthState(currentUser.id);
      } else {
        // No user — clear all auth-derived state immediately
        setClientId(null);
        setUserRole(null);
      }
    } catch (err) {
      // Swallow the error so the loading gate is always released. The
      // resolved state will be the last successful one (or null on first
      // failure), which is correct: if we can't read the role, the
      // ProtectedRoute null-role branch will require the user to sign in
      // again rather than hang forever.
      console.error('[useAuth] Failed to resolve auth state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [resolveAuthState]);

  useEffect(() => {
    let mounted = true;

    // DIAGNOSTIC: Track how many times the effect runs
    console.log('[AUTH] useEffect MOUNT (mounted=' + mounted + ')');

    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log('[AUTH] onAuthStateChange event:', event, 'hasSession:', !!currentSession);
        if (!mounted) return;
        // IMPORTANT: Do NOT await handleAuthChange here. The Supabase client's
        // _notifyAllSubscribers awaits the callback, and it is called from
        // within _acquireLock which holds an internal lockAcquired flag. If
        // handleAuthChange makes any Supabase query (like resolveAuthState
        // does), that query internally calls getSession() which tries to
        // re-acquire the same lock. Since the lock is still held by the
        // current _recoverAndRefresh call (which is waiting for this callback
        // to return), the result is a deadlock — the query is queued forever
        // because the lock holder is waiting for the callback which is waiting
        // for the query.
        //
        // Deferring via queueMicrotask breaks the cycle: the callback returns
        // immediately, _notifyAllSubscribers releases the lock, and
        // handleAuthChange runs in a microtask *after* the lock is free. Any
        // subsequent getSession() call from resolveAuthState will then be able
        // to acquire the lock normally.
        queueMicrotask(() => handleAuthChange(currentSession));
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      console.log('[AUTH] getSession resolved, hasSession:', !!existingSession);
      if (!mounted) return;
      await handleAuthChange(existingSession);
    });

    return () => {
      console.log('[AUTH] useEffect UNMOUNT');
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  const signOut = async () => {
    // Previously used Promise.race with a timeout, which does NOT cancel
    // the underlying supabase.auth.signOut() call — it just stops waiting
    // for it. With the navigator-lock strategy now disabled (see
    // client.ts), an abandoned signOut() can no longer block every tab
    // on the origin, but it can still silently fail. Just await it
    // directly and log any real error; no artificial timeout needed.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('signOut failed:', err);
    }
    // Auth state change handler will clear all state
  };

  const isAuthenticated = !!session;
  const isClient = userRole === 'client';
  const isCoach = userRole === 'coach';

  const value: AuthContextType = {
    user,
    session,
    userId: user?.id ?? null,
    isLoading,
    isAuthenticated,
    signOut,
    userRole,
    isClient,
    isCoach,
    clientId,
    refreshAuthState,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Helper to get current user ID from a resolved auth state.
 * Use this in services when you need the UID for database writes.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}
