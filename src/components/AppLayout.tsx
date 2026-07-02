/**
 * AppLayout — shared shell with header, client selector, and navigation.
 * Renders children via React Router <Outlet />.
 */

import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useSupabaseClients } from '@/hooks/useSupabaseClients';
import { ClientSelector } from '@/components/ClientSelector';
import type { Client, CompletePlan } from '@/types';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

/**
 * Shared state exposed to child routes via AppLayout context.
 * Child routes access this via the useAppLayout() hook (defined below).
 */
export interface AppLayoutContext {
  clients: Client[];
  activeClientId: string | null;
  activeClient: Client | null;
  isLoadingClients: boolean;
  clientError: string | null;
  setActiveClientId: (id: string) => void;
  handleCreateClient: (client: Client) => Promise<{ success: boolean; client: Client | null; error: string | null }>;
  refreshClients: () => void;
  createNewClientDraft: () => Client;
  clientRestrictions: ClientIngredientRestrictions[];
  setClientRestrictions: React.Dispatch<React.SetStateAction<ClientIngredientRestrictions[]>>;
  generatedPlan: CompletePlan | null;
  setGeneratedPlan: React.Dispatch<React.SetStateAction<CompletePlan | null>>;
}

// Tab-to-route mapping
const TAB_ROUTES = [
  { value: 'client', label: 'Client', path: '' },
  { value: 'ingredients', label: 'Ingredients', path: 'ingredients' },
  { value: 'checkin', label: 'Check-in', path: 'checkin' },
  { value: 'nutrition', label: 'Nutrition', path: 'nutrition' },
  { value: 'training', label: 'Training', path: 'training' },
  { value: 'progress', label: 'Progress', path: 'progress' },
] as const;

export default function AppLayout() {
  const { isLoading: isAuthLoading, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId } = useParams<{ clientId: string }>();

  const {
    clients,
    activeClientId,
    activeClient,
    isLoading: isLoadingClients,
    error: clientError,
    setActiveClientId,
    handleCreateClient,
    refreshClients,
    createNewClientDraft,
  } = useSupabaseClients();

  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);
  const [generatedPlan, setGeneratedPlan] = useState<CompletePlan | null>(null);

  // Derive active tab from current route
  const pathSegments = location.pathname.split('/').filter(Boolean);
  // Routes: / | /clients/:id | /clients/:id/nutrition etc.
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  const activeTab = TAB_ROUTES.find(t => t.path === lastSegment)?.value
    ?? (routeClientId && pathSegments.length === 2 ? 'client' : 'client');

  const handleTabChange = (tab: string) => {
    const route = TAB_ROUTES.find(t => t.value === tab);
    if (!route) return;

    const cid = activeClientId || routeClientId;
    if (!cid) {
      navigate('/');
      return;
    }

    if (route.path === '') {
      navigate(`/clients/${cid}`);
    } else {
      navigate(`/clients/${cid}/${route.path}`);
    }
  };

  const handleClientChange = (clientId: string) => {
    setActiveClientId(clientId);
    setGeneratedPlan(null);
    // Navigate to the same tab for the new client
    const route = TAB_ROUTES.find(t => t.value === activeTab);
    if (route && route.path) {
      navigate(`/clients/${clientId}/${route.path}`);
    } else {
      navigate(`/clients/${clientId}`);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Isolate generated plan to the active client. The active client can change
  // via routing (deep link, browser back/forward) as well as via the selector,
  // so reset in both paths. Resetting in handleClientChange covers the
  // selector path; this effect covers the routing path.
  useEffect(() => {
    setGeneratedPlan(null);
  }, [activeClientId, setGeneratedPlan]);

  // Create context object. Must be called unconditionally before any early return
  // to satisfy React Hook rules (hooks must execute in the same order every render).
  const context: AppLayoutContext = useMemo(
    () => ({
      clients,
      activeClientId,
      activeClient,
      isLoadingClients,
      clientError,
      setActiveClientId,
      handleCreateClient,
      refreshClients,
      createNewClientDraft,
      clientRestrictions,
      setClientRestrictions,
      generatedPlan,
      setGeneratedPlan,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      isLoadingClients,
      clientError,
      setActiveClientId,
      handleCreateClient,
      refreshClients,
      createNewClientDraft,
      clientRestrictions,
      setClientRestrictions,
      generatedPlan,
      setGeneratedPlan,
    ]
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="tactical-label">Initializing authentication</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b border-border py-5 px-4">
        <div className="container mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-1 bg-primary" aria-hidden="true" />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                FitPlan Pro
              </h1>
              <p className="tactical-label mt-1">Nutrition &amp; Training Command</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            {user?.email && (
              <span className="font-body text-xs text-muted-foreground">
                Signed in as <span className="text-foreground">{user.email}</span>
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        {/* Client selector — shown when we have multiple clients */}
        {!isLoadingClients && clients.length > 1 && (
          <div className="mb-4">
            <ClientSelector
              clients={clients}
              activeClientId={activeClientId}
              onClientChange={handleClientChange}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-card border border-border">
            {TAB_ROUTES.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Route content */}
        <div className="mt-6">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  );
}
