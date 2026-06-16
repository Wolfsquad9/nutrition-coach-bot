import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  CheckCircle,
  TrendingUp,
  MessageCircle,
  LogOut,
} from 'lucide-react';

export default function ClientLayout() {
  const { user, signOut, clientId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const clientName = user?.user_metadata?.full_name || user?.email || 'Client';

  useEffect(() => {
    if (!clientId) return;

    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from('coach_messages')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    };

    fetchUnreadCount();

    // Set up realtime subscription for new unread messages
    const channel = supabase
      .channel('unread_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_messages',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const navItems = [
    {
      to: '/my-plan',
      label: 'Plan',
      icon: BookOpen,
    },
    {
      to: '/checkin',
      label: 'Check-in',
      icon: CheckCircle,
    },
    {
      to: '/progress',
      label: 'Progress',
      icon: TrendingUp,
    },
    {
      to: '/messages',
      label: 'Messages',
      icon: MessageCircle,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card-hover flex flex-col pb-16 md:pb-0 md:pl-0">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-primary">FitPlan Pro</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-sm font-medium">{clientName}</span>
          </div>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container px-4 py-6 max-w-4xl mx-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation for Mobile / Lower Navigation for layout */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 px-4 shadow-lg md:relative md:border-t-0 md:bg-transparent md:backdrop-blur-none md:shadow-none md:py-0 md:mb-6">
        <div className="max-w-md mx-auto flex justify-around items-center md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex flex-col items-center gap-1 text-xs font-medium transition-colors p-2 ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Desktop view navigation under top bar as tabs if preferred, but bottom-tab on mobile is standard */}
        <div className="hidden md:flex justify-center items-center gap-4 mb-6">
          <div className="bg-muted p-1 rounded-lg flex gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
