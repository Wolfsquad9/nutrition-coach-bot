import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { claimClientInvitation } from '@/services/clientInvitationService';
import { useAuth } from '@/hooks/useAuth';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const inviteToken = searchParams.get('invite');
  const { isAuthenticated, isReady, userRole } = useAuth();

  // Navigate on auth state change — the AuthProvider owns role resolution
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    if (userRole === 'client') {
      navigate('/my-plan', { replace: true });
    } else if (userRole === 'coach') {
      navigate('/', { replace: true });
    }
  }, [isReady, isAuthenticated, userRole, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const options: Parameters<typeof supabase.auth.signUp>[0] = { email, password };
    if (inviteToken) {
      options.options = {
        data: {
          role: 'client',
        },
      };
    }
    const { data, error } = await supabase.auth.signUp(options);

    if (error) {
      setSubmitting(false);
      toast({ title: 'Signup failed', description: error.message, variant: 'destructive' });
      return;
    }

    if (inviteToken && data.session) {
      // Claim the invitation immediately after signup
      const claimResult = await claimClientInvitation(inviteToken);
      setSubmitting(false);

      if (claimResult.error) {
        toast({ title: 'Account created', description: claimResult.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Client access linked', description: 'Your account is linked to your plan.' });
      // AuthProvider will resolve the new clientId and role, then useEffect navigates
      return;
    }

    setSubmitting(false);
    toast({
      title: 'Account created',
      description: inviteToken
        ? 'Please confirm your email, then use the invitation link again to finish linking your plan.'
        : 'Please check your email to confirm your account.',
    });
    // No navigation — user needs to check email
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-1 w-12 bg-primary" aria-hidden="true" />
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">FitPlan Pro</h1>
          <p className="tactical-label mt-2">{inviteToken ? 'Create your client account to view your plan' : 'Create your coach account'}</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Sign up'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login'} className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
