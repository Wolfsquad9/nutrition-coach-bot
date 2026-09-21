/**
 * useAuth — Phase 12 auth-resilience regression tests.
 *
 * Contract under test (see resolveAuthState docs in useAuth.tsx):
 *   1. successful lookup + row found    -> role mapped ('trainer' -> 'coach')
 *   2. successful lookup + no row       -> role null (GENUINE absence)
 *   3. failed lookup after retries      -> last-known role RETAINED (no logout)
 *   4. retry/recovery                   -> role resolves normally after blip
 *   5. ProtectedRoute                   -> still redirects for a genuinely
 *      missing role (behavior unchanged)
 *   6. SIGNED_OUT                       -> all auth-derived state cleared
 *   7. clients lookup failure           -> last-known clientId RETAINED
 *
 * The Supabase client is mocked at the module boundary; supabase-js query
 * failures are simulated exactly as they occur in production: the promise
 * RESOLVES with { data: null, error } (it does not throw).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, waitFor, act, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

type LookupResponse = { data: unknown; error: { message: string } | null };

const h = vi.hoisted(() => {
  let authChangeCb: ((event: string, session: unknown) => void) | null = null;
  let roleResponse: LookupResponse = { data: null, error: null };
  let roleQueue: LookupResponse[] = [];
  let clientsResponse: LookupResponse = { data: null, error: null };
  let session: unknown = null;
  let roleAttempts = 0;
  let clientsAttempts = 0;
  // Auth-race test support: make the NEXT N user_roles lookups hang until
  // explicitly released, and record which uid each lookup was for.
  let deferredLookupsPending = 0;
  const pendingRoleResolvers: ((r: LookupResponse) => void)[] = [];
  const roleLookupUids: string[] = [];
  const supabase = {
    auth: {
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => {
          if (table === 'user_roles') roleLookupUids.push(val);
          return {
            maybeSingle: async () => {
              if (table === 'user_roles') {
                roleAttempts += 1;
                if (deferredLookupsPending > 0) {
                  deferredLookupsPending -= 1;
                  return new Promise<LookupResponse>((resolve) => {
                    pendingRoleResolvers.push(resolve);
                  });
                }
                return roleQueue.length > 0 ? roleQueue.shift()! : roleResponse;
              }
              if (table === 'clients') {
                clientsAttempts += 1;
                return clientsResponse;
              }
              return { data: null, error: null };
            },
          };
        },
      }),
    }),
  };
  return {
    supabase,
    emitAuthEvent: (event: string, s: unknown) => authChangeCb?.(event, s),
    setRoleResponse: (r: LookupResponse) => {
      roleResponse = r;
    },
    setRoleSequence: (seq: LookupResponse[]) => {
      roleQueue = seq;
    },
    setClientsResponse: (r: LookupResponse) => {
      clientsResponse = r;
    },
    setSession: (s: unknown) => {
      session = s;
    },
    getRoleAttempts: () => roleAttempts,
    getClientsAttempts: () => clientsAttempts,
    resetAttempts: () => {
      roleAttempts = 0;
      clientsAttempts = 0;
      roleQueue = [];
      deferredLookupsPending = 0;
      roleLookupUids.length = 0;
      // Drop any dangling deferred resolvers from earlier tests — their
      // continuations belong to unmounted providers and must not leak.
      pendingRoleResolvers.length = 0;
    },
    deferNextRoleLookup: () => {
      deferredLookupsPending += 1;
    },
    releaseRole: (r: LookupResponse) => {
      const resolve = pendingRoleResolvers.shift();
      if (resolve) resolve(r);
      else roleResponse = r;
    },
    getRoleLookupUids: () => [...roleLookupUids],
    getPendingRoleLookups: () => pendingRoleResolvers.length,
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

import { AuthProvider, useAuth } from './useAuth';
import ProtectedRoute from '@/components/ProtectedRoute';

const SESSION = { user: { id: 'uid-1' } } as unknown as Session;

const ROLE_FOUND: LookupResponse = { data: { role: 'trainer' }, error: null };
const ROLE_ABSENT: LookupResponse = { data: null, error: null };
const ROLE_FETCH_FAILED: LookupResponse = {
  data: null,
  error: { message: 'TypeError: Failed to fetch' },
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth — Phase 12 auth resilience', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.resetAttempts();
    h.setRoleResponse(ROLE_ABSENT);
    h.setClientsResponse({ data: null, error: null });
    h.setSession(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. a successful role lookup returns the expected role', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_FOUND);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.userRole).toBe('coach');
    expect(result.current.isCoach).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    // Happy path: exactly one attempt, no retries burned.
    expect(h.getRoleAttempts()).toBe(1);
  });

  it('2. a successful lookup with no role row produces null (genuine absence)', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_ABSENT);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.userRole).toBeNull();
    // Absence is a valid authorization answer; the session is not a casualty.
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('3. a transient role lookup failure does NOT clear an already-known role', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_FOUND);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.userRole).toBe('coach'));

    h.resetAttempts();
    h.setRoleResponse(ROLE_FETCH_FAILED);
    // Same trigger as the production incident: TOKEN_REFRESHED re-resolution
    // hitting a network blip.
    act(() => {
      h.emitAuthEvent('TOKEN_REFRESHED', SESSION);
    });
    await waitFor(
      () => expect(h.getRoleAttempts()).toBeGreaterThanOrEqual(2),
      { timeout: 15000 },
    );
    // Role is UNKNOWN after the blip, not "absent": it must be retained.
    expect(result.current.userRole).toBe('coach');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('4. retries recover and the role resolves normally after a transient failure', async () => {
    h.setSession(SESSION);
    h.setRoleSequence([ROLE_FETCH_FAILED, ROLE_FETCH_FAILED, ROLE_FOUND]);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.userRole).toBe('coach'), { timeout: 5000 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.getRoleAttempts()).toBe(3);
  });

  it('5. ProtectedRoute still redirects when the role is genuinely missing', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_ABSENT); // successful lookup, no row
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/coach-area']}>
          <Routes>
            <Route path="/login" element={<div>LOGIN_PAGE</div>} />
            <Route
              path="/coach-area"
              element={
                <ProtectedRoute role="coach">
                  <div>COACH_CONTENT</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument());
    expect(screen.queryByText('COACH_CONTENT')).not.toBeInTheDocument();
  });

  it('6. SIGNED_OUT clears all auth-derived state', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_FOUND);
    h.setClientsResponse({ data: { id: 'client-1' }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.userRole).toBe('coach'));

    await act(async () => {
      await result.current.signOut();
      h.emitAuthEvent('SIGNED_OUT', null);
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.userRole).toBeNull();
    expect(result.current.clientId).toBeNull();
  });

  it('7. a transient clients lookup failure retains the last-known clientId', async () => {
    h.setSession(SESSION);
    h.setRoleResponse(ROLE_FOUND);
    h.setClientsResponse({ data: { id: 'client-1' }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.clientId).toBe('client-1'));

    h.resetAttempts();
    h.setClientsResponse({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    act(() => {
      h.emitAuthEvent('TOKEN_REFRESHED', SESSION);
    });
    await waitFor(
      () => expect(h.getClientsAttempts()).toBeGreaterThanOrEqual(2),
      { timeout: 15000 },
    );
    expect(result.current.clientId).toBe('client-1'); // retained, NOT nulled
  });


});

/**
 * Auth resolution race — regression tests (proven pre-existing E2E bug).
 *
 * Production sequence: the post-sign-in navigation brings the user to the
 * protected area while the role lookup is still in flight (LoginPage
 * navigates as soon as signInWithPassword resolves). ProtectedRoute used to
 * treat "role not yet resolved" as "unauthorized" and bounced the
 * authenticated user back to /login ~165ms before the valid role arrived
 * (reproduced 13/19 times under back-to-back timing).
 *
 * Invariant under test:
 *   AUTHENTICATED + resolution pending => WAIT (spinner), NEVER /login.
 *   Every resolution path must terminate (found / absence / failure).
 */
/** Stand-in for LoginPage's post-sign-in `navigate('/')`. */
function GoToCoachAreaButton() {
  const navigate = useNavigate();
  return (
    <div>
      LOGIN_PAGE
      <button type="button" onClick={() => navigate('/coach-area', { replace: true })}>
        GO_TO_COACH_AREA
      </button>
    </div>
  );
}

describe('useAuth / ProtectedRoute — auth resolution race (regression)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.resetAttempts();
    h.setRoleResponse(ROLE_FOUND);
    h.setClientsResponse({ data: null, error: null });
    h.setSession(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderGuard = () =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/coach-area']}>
          <Routes>
            <Route
              path="/login"
              element={<GoToCoachAreaButton />}
            />
            <Route
              path="/coach-area"
              element={
                <ProtectedRoute role="coach">
                  <div>COACH_CONTENT</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

  /** Mirror the production flow: the post-sign-in navigation brings the
   * user to the protected area WHILE the role lookup is still in flight
   * (LoginPage navigates as soon as signInWithPassword resolves). */
  const signInThenNavigateWhilePending = async () => {
    const view = renderGuard();
    // Signed out initially → login page is the correct starting point.
    await waitFor(() => expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument());
    h.deferNextRoleLookup();
    await act(async () => {
      h.emitAuthEvent('SIGNED_IN', SESSION);
    });
    // The sign-in resolved → the app navigates to the protected area.
    await act(async () => {
      screen.getByText('GO_TO_COACH_AREA').click();
    });
    // Deterministic: the deferred role lookup is now registered (pending).
    await waitFor(() => expect(h.getPendingRoleLookups()).toBe(1));
    return view;
  };

  it('1. authenticated + role resolution pending: must NOT redirect to /login', async () => {
    const { container } = await signInThenNavigateWhilePending();

    // While the role lookup is pending the guard must WAIT (spinner)…
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
    // …and NEVER land on /login for an authenticated user.
    expect(screen.queryByText('LOGIN_PAGE')).not.toBeInTheDocument();
  });

  it('2. authenticated + role resolves to coach: renders the protected content', async () => {
    const { container } = await signInThenNavigateWhilePending();
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    await act(async () => {
      h.releaseRole(ROLE_FOUND);
    });

    await waitFor(() => expect(screen.getByText('COACH_CONTENT')).toBeInTheDocument());
    expect(screen.queryByText('LOGIN_PAGE')).not.toBeInTheDocument();
  });

  it('3. authenticated + resolution completes with no valid role: follows existing authorization behavior', async () => {
    const { container } = await signInThenNavigateWhilePending();
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    await act(async () => {
      h.releaseRole(ROLE_ABSENT);
    });

    await waitFor(() => expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument());
    expect(screen.queryByText('COACH_CONTENT')).not.toBeInTheDocument();
  });

  it('4. role lookup failure terminates resolution (no infinite spinner) and follows the existing fallback', async () => {
    const { container } = renderGuard();
    // Signed out initially → login page is the correct starting point.
    await waitFor(() => expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument());

    // EVERY role lookup attempt fails (network-level failure, resolves with
    // an error exactly as supabase-js does in production).
    h.setRoleResponse(ROLE_FETCH_FAILED);
    await act(async () => {
      h.emitAuthEvent('SIGNED_IN', SESSION);
    });
    // Simulate the post-sign-in navigation while resolution is in flight.
    await act(async () => {
      screen.getByText('GO_TO_COACH_AREA').click();
    });
    await waitFor(() => {
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    // Retries exhaust (5 attempts) → resolution TERMINATES, spinner released…
    await waitFor(
      () => expect(container.querySelector('.animate-spin')).toBeNull(),
      { timeout: 15000 },
    );
    // …and the existing authorization fallback applies (no valid role).
    await waitFor(() => expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument());
    expect(screen.queryByText('COACH_CONTENT')).not.toBeInTheDocument();
  });

  it('5. a stale concurrent resolution must not overwrite newer auth state', async () => {
    const SESSION_B = { user: { id: 'uid-2' } } as unknown as Session;
    const ROLE_CLIENT: LookupResponse = { data: { role: 'client' }, error: null };
    const { result } = renderHook(() => useAuth(), { wrapper });
    // Start from the settled signed-out state so the emitted events are the
    // only resolutions in play.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    // Resolution A starts (older session) and hangs on its role lookup…
    h.deferNextRoleLookup();
    await act(async () => {
      h.emitAuthEvent('SIGNED_IN', SESSION);
    });
    await waitFor(() => expect(h.getPendingRoleLookups()).toBe(1));
    // …resolution B (newer session) supersedes it and completes.
    await act(async () => {
      h.emitAuthEvent('SIGNED_IN', SESSION_B);
    });
    await waitFor(() => expect(result.current.userRole).toBe('coach'));

    // The OLDER resolution finally returns — it must not win.
    await act(async () => {
      h.releaseRole(ROLE_CLIENT);
    });
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.userRole).toBe('coach');
    expect(result.current.isAuthenticated).toBe(true);
    // Both lookups were issued (A's deferred, B's immediate), A for uid-1, B for uid-2.
    expect(h.getRoleLookupUids()).toEqual(['uid-1', 'uid-2']);
  });
});

