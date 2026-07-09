/**
 * Authentication hook for Supabase — email/password auth.
 * SINGLE SOURCE OF TRUTH for:
 *   - authenticated user (auth.users)
 *   - application role (from profiles/user_roles DB, falling back to user_metadata)
 *   - resolved clientId (clients.id via clients.user_profile_id)
 *
 * The AuthProvider owns the complete lifecycle:
 *   auth.users.id → clients.user_profile_id → clients.id
 *
 * Pages must only consume via useAuth().
 * Pages must NEVER call refreshClientId() or similar.
 * Pages must never manually refresh auth state.
 *
 * The `isReady` flag guarantees that clientId and role are fully resolved
 * before any consumer sees a non-loading state.
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  /** True once session, role, and clientId (if applicable) are fully resolved. */
  isReady: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  userRole: 'coach' | 'client' | null;
  isClient: boolean;
  isCoach: boolean;
  clientId: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userId: null,
  isLoading: true,
  isReady: false,
  isAuthenticated: false,
  signOut: async () => {},
  userRole: null,
  isClient: false,
  isCoach: false,
  clientId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'coach' | 'client' | null>(null);

  // Track whether we've initialized to avoid stale callbacks
  const initializedRef = useRef(false);

  /**
   * Resolve clientId from the clients table using the authenticated user's UID.
   * This is the ONLY source of truth for clientId.
   */
  const resolveClientId = useCallback(async (uid: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_profile_id', uid)
        .maybeSingle();

      if (error) {
        console.error('[useAuth] Failed to resolve clientId:', error.message);
        return null;
      }
      return data?.id ?? null;
    } catch (err) {
      console.error('[useAuth] Unexpected error resolving clientId:', err);
      return null;
    }
  }, []);

  /**
   * Resolve the application role from the database (profiles or user_roles),
   * falling back to user_metadata.role if no DB record exists.
   */
  const resolveUserRole = useCallback(async (uid: string, currentUser: User): Promise<'coach' | 'client'> => {
    try {
      // Check user_roles table first (authoritative for invitation workflow)
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .maybeSingle();

      if (!roleError && roleData?.role) {
        return roleData.role as 'coach' | 'client';
      }

      // Fall back to profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .maybeSingle();

      if (!profileError && profileData?.role) {
        return profileData.role as 'coach' | 'client';
      }

      // Final fallback: user_metadata
      const metaRole = currentUser.user_metadata?.role;
      if (metaRole === 'client' || metaRole === 'coach') {
        return metaRole;
      }

      // Default to coach (self-serve signups are coaches)
      return 'coach';
    } catch (err) {
      console.error('[useAuth] Failed to resolve user role:', err);
      const metaRole = currentUser.user_metadata?.role;
      if (metaRole === 'client' || metaRole === 'coach') {
        return metaRole;
      }
      return 'coach';
    }
  }, []);

  /**
   * Resolve all auth-derived state for a given user.
   * This is the single orchestration point.
   */
  const resolveAuthState = useCallback(async (currentUser: User, currentSession: Session | null) => {
    const uid = currentUser.id;

    // Resolve clientId and role in parallel
    const [resolvedClientId, resolvedRole] = await Promise.all([
      resolveClientId(uid),
      resolveUserRole(uid, currentUser),
    ]);

    // Only update state if this is still the current session
    const { data: { session: latestSession } } = await supabase.auth.getSession();
    if (latestSession?.user?.id !== uid) {
      // Session changed while we were resolving — bail out
      return;
    }

    setClientId(resolvedClientId);
    setUserRole(resolvedRole);
    setIsReady(true);
    setIsLoading(false);
  }, [resolveClientId, resolveUserRole]);

  /**
   * Handle an auth state change event.
   * Called both from the onAuthStateChange subscription AND from getSession().
   */
  const handleAuthChange = useCallback(async (currentSession: Session | null) => {
    setSession(currentSession);
    const currentUser = currentSession?.user ?? null;
    setUser(currentUser);

    if (currentUser) {
      // Reset ready state while resolving
      setIsReady(false);
      await resolveAuthState(currentUser, currentSession);
    } else {
      // No user — clear all auth-derived state immediately
      setClientId(null);
      setUserRole(null);
      setIsReady(true);
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

    initializedRef.current = true;

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
    isReady,
    isAuthenticated,
    signOut,
    userRole,
    isClient,
    isCoach,
    clientId,
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