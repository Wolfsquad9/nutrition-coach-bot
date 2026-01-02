/**
 * Hook for managing clients with Supabase persistence
 * No mock data fallbacks - Supabase is the single source of truth
 */

import { useState, useEffect, useCallback } from 'react';
import { Client } from '@/types';
import { 
  fetchClients, 
  createClient as createSupabaseClient,
  updateClient as updateSupabaseClient 
} from '@/services/supabaseClientService';

// Default empty client for new client creation form
const createEmptyClient = (): Client => ({
  id: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: 'male',
  age: 30,
  height: 175,
  weight: 75,
  activityLevel: 'moderately_active',
  primaryGoal: 'maintenance',
  trainingExperience: 'intermediate',
  trainingDaysPerWeek: 4,
  sessionDuration: 60,
  preferredTrainingStyle: 'hypertrophy',
  equipment: [],
  dietType: 'omnivore',
  mealsPerDay: 4,
  intolerances: [],
  allergies: [],
  dislikedFoods: [],
  medicalConditions: [],
  medications: [],
  injuries: [],
  hasRedFlags: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

interface UseSupabaseClientsResult {
  clients: Client[];
  activeClient: Client | null;
  isLoading: boolean;
  error: string | null;
  setActiveClient: (client: Client | null) => void;
  handleCreateClient: (client: Client) => Promise<{ success: boolean; client: Client | null; error: string | null }>;
  handleUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<{ success: boolean; error: string | null }>;
  refreshClients: () => Promise<void>;
  createNewClientDraft: () => Client;
}

export function useSupabaseClients(): UseSupabaseClientsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchClients();
      setClients(result.clients);
      
      // Set first client as active if available, otherwise null
      if (result.clients.length > 0) {
        setActiveClient(result.clients[0]);
      } else {
        setActiveClient(null);
      }
    } catch (err: any) {
      console.error('Error loading clients:', err);
      setError(err.message || 'Failed to load clients from Supabase');
      setClients([]);
      setActiveClient(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleCreateClient = useCallback(async (client: Client): Promise<{ success: boolean; client: Client | null; error: string | null }> => {
    try {
      const result = await createSupabaseClient(client);
      
      if (result.error || !result.client) {
        return { success: false, client: null, error: result.error || 'Failed to create client' };
      }

      // Add to local state
      setClients(prev => [result.client!, ...prev]);
      setActiveClient(result.client);
      
      return { success: true, client: result.client, error: null };
    } catch (err: any) {
      console.error('Error creating client:', err);
      return { success: false, client: null, error: err.message || 'Failed to create client' };
    }
  }, []);

  const handleUpdateClient = useCallback(async (clientId: string, updates: Partial<Client>): Promise<{ success: boolean; error: string | null }> => {
    try {
      const result = await updateSupabaseClient(clientId, updates);
      
      if (result.error || !result.client) {
        return { success: false, error: result.error || 'Failed to update client' };
      }

      // Update local state
      setClients(prev => prev.map(c => c.id === clientId ? result.client! : c));
      if (activeClient.id === clientId) {
        setActiveClient(result.client);
      }
      
      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error updating client:', err);
      return { success: false, error: err.message || 'Failed to update client' };
    }
  }, [activeClient.id]);

  return {
    clients,
    activeClient,
    isLoading,
    error,
    setActiveClient,
    handleCreateClient,
    handleUpdateClient,
    refreshClients: loadClients,
    createNewClientDraft: createEmptyClient,
  };
}
