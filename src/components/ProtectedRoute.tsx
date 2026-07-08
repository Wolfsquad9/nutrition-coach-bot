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
 * Unauthenticated users → /login
 * Coach accessing a client route → /my-plan
 * Client accessing a coach route → /
 */
export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, userRole } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Role-based access control
  if (role && userRole && userRole !== role) {
    if (role === 'coach') {
      // Client trying to access a coach route → redirect to client home
      return <Navigate to="/my-plan" replace />;
    }
    if (role === 'client') {
      // Coach trying to access a client route → redirect to coach home
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}