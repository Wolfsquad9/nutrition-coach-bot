/**
 * AppLayout — shared shell with header, client selector, and navigation.
 * Renders children via React Router <Outlet />.
 */

import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useSupabaseClients } from '@/hooks/useSupabaseClients';
import { ClientSelector } from '@/components/ClientSelector';
import type { Client } from '@/types';
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
}

// Tab-to-route mapping
const TAB_ROUTES = [
  { value: 'client', label: 'Client', path: '' },
  { value: 'ingredients', label: 'Ingredients', path: 'ingredients' },
  { value: 'nutrition', label: 'Nutrition', path: 'nutrition' },
  { value: 'training', label: 'Training', path: 'training' },
  { value: 'progress', label: 'Progress', path: 'progress' },
] as const;

export default function AppLayout() {
  const { isLoading: isAuthLoading } = useAuth();
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
    // Navigate to the same tab for the new client
    const route = TAB_ROUTES.find(t => t.value === activeTab);
    if (route && route.path) {
      navigate(`/clients/${clientId}/${route.path}`);
    } else {
      navigate(`/clients/${clientId}`);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-card-hover flex items-center justify-center">
        <Card className="p-8 shadow-card">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Initializing authentication...</p>
          </div>
        </Card>
      </div>
    );
  }

  const context: AppLayoutContext = {
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card-hover">
      <header className="bg-gradient-hero text-white py-6 px-4 shadow-xl">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold">FitPlan Pro</h1>
          <p className="text-white/90 mt-2">Professional Nutrition & Training Planning System</p>
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
          <TabsList className="grid w-full grid-cols-5 bg-card shadow-card">
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
