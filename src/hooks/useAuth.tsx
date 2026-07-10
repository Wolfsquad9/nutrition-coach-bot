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

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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

  /**
   * Fetch role from user_roles and clientId from clients in parallel.
   * This is the ONLY code path for resolving auth-derived state.
   */
  const resolveAuthState = useCallback(async (uid: string) => {
    const [{ data: roleData }, { data: clientData }] = await Promise.all([
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase
        .from('clients')
        .select('id')
        .eq('user_profile_id', uid)
        .maybeSingle(),
    ]);

    // Map DB role ('trainer') to frontend role ('coach')
    const dbRole = roleData?.role;
    const mappedRole: 'coach' | 'client' | null =
      dbRole === 'client' ? 'client' :
      dbRole === 'trainer' ? 'coach' :
      null;

    setUserRole(mappedRole);
    setClientId(clientData?.id ?? null);
  }, []);

  /**
   * Public method for pages to call after invitation claim mutates the DB.
   * Re-fetches role and clientId, updates state.
   */
  const refreshAuthState = useCallback(async () => {
    if (!user?.id) return;
    await resolveAuthState(user.id);
  }, [user?.id, resolveAuthState]);

  /**
   * Handle an auth state change event.
   * Single resolution path: read from DB, set isLoading=false when done.
   */
  const handleAuthChange = useCallback(async (currentSession: Session | null) => {
    setSession(currentSession);
    const currentUser = currentSession?.user ?? null;
    setUser(currentUser);

    if (currentUser) {
      // Single resolution: read from database, no metadata fallback
      await resolveAuthState(currentUser.id);
      setIsLoading(false);
    } else {
      // No user — clear all auth-derived state immediately
      setClientId(null);
      setUserRole(null);
      setIsLoading(false);
    }
  }, [resolveAuthState]);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        if (!mounted) return;
        await handleAuthChange(currentSession);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (!mounted) return;
      await handleAuthChange(existingSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  const signOut = async () => {
    await supabase.auth.signOut();
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
