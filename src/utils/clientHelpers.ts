/**
 * Helper functions for client display and formatting
 */

import { Client } from '@/types';

/**
 * Generate a human-readable label for a client
 * Uses name if available, otherwise falls back to weight + goal
 */
export function getClientLabel(client: Client): string {
  const hasName = client.firstName?.trim() || client.lastName?.trim();
  
  if (hasName) {
    return `${client.firstName || ''} ${client.lastName || ''}`.trim();
  }
  
  // Format goal for display
  const goalLabels: Record<string, string> = {
    fat_loss: 'Perte de graisse',
    muscle_gain: 'Prise de muscle',
    recomposition: 'Recomposition',
    maintenance: 'Maintenance',
  };
  
  const goalLabel = goalLabels[client.primaryGoal] || client.primaryGoal;
  
  return `Client — ${client.weight}kg — ${goalLabel}`;
}

/**
 * Find a client by ID in a list
 */
export function findClientById(clients: Client[], clientId: string | null): Client | null {
  if (!clientId) return null;
  return clients.find(c => c.id === clientId) || null;
}
