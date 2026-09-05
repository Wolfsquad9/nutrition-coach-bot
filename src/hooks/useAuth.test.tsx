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
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'user_roles') {
              roleAttempts += 1;
              return roleQueue.length > 0 ? roleQueue.shift()! : roleResponse;
            }
            if (table === 'clients') {
              clientsAttempts += 1;
              return clientsResponse;
            }
            return { data: null, error: null };
          },
        }),
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
    },
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

