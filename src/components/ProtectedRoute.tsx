import { useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If specified, only users with this role can access the route. */
  role?: 'coach' | 'client';
}

/**
 * Wraps routes that require authentication.
 * Optionally restricts access by role.
 *
 * isLoading is the only loading gate — role and clientId are fully resolved
 * before isLoading becomes false (single DB query path).
 *
 * Unauthenticated users → /login
 * Coach accessing a client route → /
 * Client accessing a coach route → /my-plan
 */
export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, userRole } = useAuth();

  // Memoize the last redirect target so re-renders that produce the same
  // (isAuthenticated, userRole, role) tuple do not emit a fresh <Navigate>.
  // Prevents the "history.replaceState > 100" loop when the auth state
  // updates cause ProtectedRoute to re-render multiple times in a row with
  // an unchanged verdict.
  const lastRedirectRef = useRef<string | null>(null);

  // Show loading spinner while auth state is initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (lastRedirectRef.current !== '/login') {
      lastRedirectRef.current = '/login';
    }
    return <Navigate to="/login" replace />;
  }

  // Role-based access control — only redirect when role is definitively known
  if (role && userRole && userRole !== role) {
    if (role === 'coach') {
      // Client trying to access a coach route → redirect to client home
      if (lastRedirectRef.current !== '/my-plan') {
        lastRedirectRef.current = '/my-plan';
      }
      return <Navigate to="/my-plan" replace />;
    }
    if (role === 'client') {
      // Coach trying to access a client route → redirect to coach home
      if (lastRedirectRef.current !== '/') {
        lastRedirectRef.current = '/';
      }
      return <Navigate to="/" replace />;
    }
  }

  // Authenticated with matching role — reset the memo so a future change
  // is correctly observed.
  lastRedirectRef.current = null;
  return <>{children}</>;
}
