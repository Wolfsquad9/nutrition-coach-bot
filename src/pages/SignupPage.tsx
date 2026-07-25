import { useState } from 'react';
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
  const { refreshAuthState, session } = useAuth();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // If a Supabase session is already active (e.g., a coach opened this invite
    // link in the same browser), sign it out before signup so the new account
    // does not silently replace the existing localStorage session.
    if (inviteToken && session) {
      await supabase.auth.signOut();
      toast({
        title: 'Switching accounts',
        description: 'You were already signed in. Switching to your client account.',
      });
    }

    // Cross-role email uniqueness check
    if (inviteToken) {
      // If client signup via invite, verify email isn't already used by a coach account.
      const { data: conflictData, error: conflictError } = await (supabase as any).rpc(
        'check_email_role_conflict',
        {
          p_email: email,
          p_intended_role: 'client',
          p_exclude_user_id: null,
        }
      );

      if (conflictError) {
        setSubmitting(false);
        toast({ title: 'Signup failed', description: conflictError.message, variant: 'destructive' });
        return;
      }

      if (conflictData === true) {
        setSubmitting(false);
        toast({
          title: 'Signup failed',
          description: 'This email is already registered as a coach account. Please use a different email to accept this invitation.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      // If coach signup, verify email isn't already used by a client account.
      const { data: conflictData, error: conflictError } = await (supabase as any).rpc(
        'check_email_role_conflict',
        {
          p_email: email,
          p_intended_role: 'coach',
          p_exclude_user_id: null,
        }
      );

      if (conflictError) {
        setSubmitting(false);
        toast({ title: 'Signup failed', description: conflictError.message, variant: 'destructive' });
        return;
      }

      if (conflictData === true) {
        setSubmitting(false);
        toast({
          title: 'Signup failed',
          description: 'This email is already registered as a client account. Please use a different email or contact your coach.',
          variant: 'destructive',
        });
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

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

      // Re-fetch role and clientId from DB after claim mutation
      await refreshAuthState();

      toast({ title: 'Client access linked', description: 'Your account is linked to your plan.' });
      // Navigate to client portal (not coach route)
      navigate('/my-plan', { replace: true });
      return;
    }

    setSubmitting(false);
    toast({
      title: 'Account created',
      description: inviteToken
        ? 'Please confirm your email, then use the invitation link again to finish linking your plan.'
        : 'Please check your email to confirm your account.',
    });
    // Navigate to login after non-invite signup
    navigate('/login', { replace: true });
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
