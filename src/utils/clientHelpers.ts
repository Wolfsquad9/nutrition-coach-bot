/**
 * Helper functions for client display and formatting
 */

import { Client } from '@/types';

/**
 * Generate a human-readable label for a client
 * REQUIRED format: "FirstName LastName — {weight}kg — {goal}"
 * Falls back to "Client — {weight}kg — {goal}" only if no name
 */
export function getClientLabel(client: Client): string {
  const firstName = client.firstName?.trim() || '';
  const lastName = client.lastName?.trim() || '';
  const hasName = firstName || lastName;
  
  // Format goal for display
  const goalLabels: Record<string, string> = {
    fat_loss: 'Perte de graisse',
    muscle_gain: 'Prise de muscle',
    recomposition: 'Recomposition',
    maintenance: 'Maintenance',
  };
  
  const goalLabel = goalLabels[client.primaryGoal] || client.primaryGoal;
  
  if (hasName) {
    const fullName = `${firstName} ${lastName}`.trim();
    return `${fullName} — ${client.weight}kg — ${goalLabel}`;
  }
  
  // Fallback for legacy clients without names
  return `Client — ${client.weight}kg — ${goalLabel}`;
}

/**
 * Get short display name for a client
 */
export function getClientShortName(client: Client): string {
  const firstName = client.firstName?.trim() || '';
  const lastName = client.lastName?.trim() || '';
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  return `Client (${client.weight}kg)`;
}

/**
 * Find a client by ID in a list
 */
export function findClientById(clients: Client[], clientId: string | null): Client | null {
  if (!clientId) return null;
  return clients.find(c => c.id === clientId) || null;
}

/**
 * Calculate age from birth date
 */
export function calculateAgeFromBirthDate(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
