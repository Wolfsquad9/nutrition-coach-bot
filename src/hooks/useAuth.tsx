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
   * Fetch role from user_roles and clientId from clients in parallel.
   * This is the ONLY code path for resolving auth-derived state.
   */
  const resolveAuthState = useCallback(async (uid: string) => {
    console.log('[DEBUG] resolveAuthState START, uid:', uid);

    // SEQUENTIAL AWAITS: Each query is isolated so the browser Network tab
    // shows exactly which HTTP request (if any) never completes.
    console.log('[AUTH] ⏳ user_roles query START');
    let roleData: { role: "client" | "trainer" | "admin" } | null = null;
    try {
      const roleResult = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle();
      console.log('[AUTH] ✅ user_roles query DONE', roleResult.data ? 'found' : 'not found', 'error:', roleResult.error?.message ?? 'none');
      roleData = roleResult.data;
    } catch (err) {
      console.error('[AUTH] ❌ user_roles query REJECTED:', err);
      throw err;
    }

    console.log('[AUTH] ⏳ clients query START');
    let clientIdFromDb: string | null = null;
    try {
      const clientResult = await supabase
        .from('clients')
        .select('id')
        .eq('user_profile_id', uid)
        .maybeSingle();
      console.log('[AUTH] ✅ clients query DONE', clientResult.data ? 'found' : 'not found', 'error:', clientResult.error?.message ?? 'none');
      clientIdFromDb = clientResult.data?.id ?? null;
    } catch (err) {
      console.error('[AUTH] ❌ clients query REJECTED:', err);
      throw err;
    }

    console.log('[DEBUG] resolveAuthState PROMISE.ALL DONE');
    // Map DB role ('trainer') to frontend role ('coach')
    const dbRole = roleData?.role;
    const mappedRole: 'coach' | 'client' | null =
      dbRole === 'client' ? 'client' :
      dbRole === 'trainer' ? 'coach' :
      null;

    setUserRole(mappedRole);
    setClientId(clientIdFromDb);
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
