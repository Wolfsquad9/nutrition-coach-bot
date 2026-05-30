import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { claimClientInvitation } from '@/services/clientInvitationService';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const inviteToken = searchParams.get('invite');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setIsLoading(false);
      toast({ title: 'Signup failed', description: error.message, variant: 'destructive' });
      return;
    }

    if (inviteToken && data.session) {
      const claimResult = await claimClientInvitation(inviteToken);
      setIsLoading(false);

      if (claimResult.error) {
        toast({ title: 'Account created', description: claimResult.error, variant: 'destructive' });
        navigate('/login');
        return;
      }

      toast({ title: 'Client access linked', description: 'Your account is linked to your plan.' });
      navigate(claimResult.clientId ? `/clients/${claimResult.clientId}/nutrition` : '/');
      return;
    }

    setIsLoading(false);
    toast({
      title: 'Account created',
      description: inviteToken
        ? 'Please confirm your email, then use the invitation link again to finish linking your plan.'
        : 'Please check your email to confirm your account.',
    });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">FitPlan Pro</h1>
          <p className="text-muted-foreground mt-2">{inviteToken ? 'Create your client account to view your plan' : 'Create your coach account'}</p>
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

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Sign up'}
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
