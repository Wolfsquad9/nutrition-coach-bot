/**
 * Hook for managing clients with Supabase persistence
 */

import { useState, useEffect, useCallback } from 'react';
import { Client } from '@/types';
import { sampleClient } from '@/data/sampleData';
import { 
  fetchClients, 
  createClient as createSupabaseClient,
  updateClient as updateSupabaseClient 
} from '@/services/supabaseClientService';

interface UseSupabaseClientsResult {
  clients: Client[];
  activeClient: Client;
  isLoading: boolean;
  isMockData: boolean;
  error: string | null;
  setActiveClient: (client: Client) => void;
  handleCreateClient: (client: Client) => Promise<{ success: boolean; client: Client | null; error: string | null }>;
  handleUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<{ success: boolean; error: string | null }>;
  refreshClients: () => Promise<void>;
}

export function useSupabaseClients(): UseSupabaseClientsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClient, setActiveClient] = useState<Client>(sampleClient);
  const [isLoading, setIsLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchClients();
      
      if (result.clients.length > 0) {
        setClients(result.clients);
        setActiveClient(result.clients[0]);
        setIsMockData(false);
      } else {
        // No clients in DB - use sample client as template but mark as mock
        setClients([]);
        setActiveClient({
          ...sampleClient,
          id: '', // Clear ID to indicate this is a new client
        });
        setIsMockData(true);
      }
    } catch (err: any) {
      console.error('Error loading clients:', err);
      setError(err.message || 'Failed to load clients');
      // Fallback to sample client
      setClients([]);
      setActiveClient(sampleClient);
      setIsMockData(true);
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
      setIsMockData(false);
      
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
    isMockData,
    error,
    setActiveClient,
    handleCreateClient,
    handleUpdateClient,
    refreshClients: loadClients,
  };
}
