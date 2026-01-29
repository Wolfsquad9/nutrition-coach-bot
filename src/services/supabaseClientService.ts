/**
 * Supabase Client Service
 * Handles client CRUD operations with Supabase as source of truth
 */

import { supabase } from '@/integrations/supabase/client';
import { Client } from '@/types';
import { getCurrentUserId } from '@/hooks/useAuth';

// Type for Supabase client row (matches actual DB schema)
export interface SupabaseClientRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  user_profile_id: string | null;
  created_by: string | null;
  birth_date: string;
  gender: string;
  weight: number;
  height: number;
  primary_goal: string;
  activity_level: string;
  dietary_restrictions: string[] | null;
  allergies: string[] | null;
  disliked_foods: string[] | null;
  diet_type: string | null;
  medical_conditions: string[] | null;
  training_frequency: number | null;
  training_experience: string | null;
  created_at: string;
  updated_at: string;
}

// Calculate age from birth date
function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Convert Supabase row to Client type
export function supabaseRowToClient(row: SupabaseClientRow): Client {
  const age = calculateAge(row.birth_date);
  
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    birthDate: row.birth_date,
    gender: row.gender as 'male' | 'female',
    age,
    height: Number(row.height),
    weight: Number(row.weight),
    activityLevel: row.activity_level as Client['activityLevel'],
    primaryGoal: row.primary_goal as Client['primaryGoal'],
    trainingExperience: (row.training_experience || 'intermediate') as Client['trainingExperience'],
    trainingDaysPerWeek: row.training_frequency || 4,
    sessionDuration: 60, // Default
    preferredTrainingStyle: 'hypertrophy', // Default
    equipment: [],
    dietType: (row.diet_type || 'omnivore') as Client['dietType'],
    mealsPerDay: 4, // Default
    intolerances: row.dietary_restrictions || [],
    allergies: row.allergies || [],
    dislikedFoods: row.disliked_foods || [],
    medicalConditions: row.medical_conditions || [],
    medications: [],
    injuries: [],
    hasRedFlags: (row.medical_conditions?.length || 0) > 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Convert Client to Supabase insert format
export async function clientToSupabaseRow(client: Client): Promise<Omit<SupabaseClientRow, 'id' | 'created_at' | 'updated_at'>> {
  const userId = await getCurrentUserId();
  
  return {
    first_name: client.firstName,
    last_name: client.lastName,
    email: client.email || null,
    phone: client.phone || null,
    user_profile_id: null,
    created_by: userId, // CRITICAL: Use auth.uid() for FK ownership
    birth_date: client.birthDate,
    gender: client.gender,
    weight: client.weight,
    height: client.height,
    primary_goal: client.primaryGoal,
    activity_level: client.activityLevel,
    dietary_restrictions: client.intolerances,
    allergies: client.allergies,
    disliked_foods: client.dislikedFoods,
    diet_type: client.dietType,
    medical_conditions: client.medicalConditions,
    training_frequency: client.trainingDaysPerWeek,
    training_experience: client.trainingExperience,
  };
}

/**
 * Fetch all clients from Supabase
 */
export async function fetchClients(): Promise<{ clients: Client[]; isMockData: boolean }> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return { clients: [], isMockData: false };
    }

    const clients = data.map((row) => supabaseRowToClient(row as unknown as SupabaseClientRow));
    return { clients, isMockData: false };
  } catch (error) {
    console.error('Failed to fetch clients from Supabase:', error);
    return { clients: [], isMockData: false };
  }
}

/**
 * Create a new client in Supabase
 */
export async function createClient(client: Client): Promise<{ client: Client | null; error: string | null }> {
  try {
    // Validate required fields
    if (!client.firstName?.trim() || !client.lastName?.trim()) {
      return { client: null, error: 'Le prénom et le nom sont requis' };
    }

    if (!client.birthDate) {
      return { client: null, error: 'La date de naissance est requise' };
    }

    const insertData = await clientToSupabaseRow(client);
    
    // Verify we have a created_by value
    if (!insertData.created_by) {
      return { client: null, error: 'Non authentifié. Veuillez rafraîchir la page.' };
    }
    
    const { data, error } = await supabase
      .from('clients')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating client:', error);
      return { client: null, error: error.message };
    }

    if (!data) {
      return { client: null, error: 'No data returned from insert' };
    }

    const newClient = supabaseRowToClient(data as unknown as SupabaseClientRow);
    return { client: newClient, error: null };
  } catch (error: any) {
    console.error('Failed to create client:', error);
    return { client: null, error: error.message || 'Failed to create client' };
  }
}

/**
 * Update an existing client in Supabase
 */
export async function updateClient(clientId: string, updates: Partial<Client>): Promise<{ client: Client | null; error: string | null }> {
  try {
    const updateData: Record<string, unknown> = {};
    
    if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
    if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.birthDate) updateData.birth_date = updates.birthDate;
    if (updates.gender) updateData.gender = updates.gender;
    if (updates.weight !== undefined) updateData.weight = updates.weight;
    if (updates.height !== undefined) updateData.height = updates.height;
    if (updates.primaryGoal) updateData.primary_goal = updates.primaryGoal;
    if (updates.activityLevel) updateData.activity_level = updates.activityLevel;
    if (updates.intolerances) updateData.dietary_restrictions = updates.intolerances;
    if (updates.allergies) updateData.allergies = updates.allergies;
    if (updates.dislikedFoods) updateData.disliked_foods = updates.dislikedFoods;
    if (updates.dietType) updateData.diet_type = updates.dietType;
    if (updates.medicalConditions) updateData.medical_conditions = updates.medicalConditions;
    if (updates.trainingDaysPerWeek !== undefined) updateData.training_frequency = updates.trainingDaysPerWeek;
    if (updates.trainingExperience) updateData.training_experience = updates.trainingExperience;

    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)
      .select()
      .single();

    if (error) {
      console.error('Error updating client:', error);
      return { client: null, error: error.message };
    }

    if (!data) {
      return { client: null, error: 'No data returned from update' };
    }

    const updatedClient = supabaseRowToClient(data as unknown as SupabaseClientRow);
    return { client: updatedClient, error: null };
  } catch (error: any) {
    console.error('Failed to update client:', error);
    return { client: null, error: error.message || 'Failed to update client' };
  }
}

/**
 * Fetch a single client by ID
 */
export async function fetchClientById(clientId: string): Promise<{ client: Client | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching client:', error);
      return { client: null, error: error.message };
    }

    if (!data) {
      return { client: null, error: 'Client not found' };
    }

    const client = supabaseRowToClient(data as unknown as SupabaseClientRow);
    return { client, error: null };
  } catch (error: any) {
    console.error('Failed to fetch client:', error);
    return { client: null, error: error.message || 'Failed to fetch client' };
  }
}
