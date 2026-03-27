"use strict";
/**
 * Profile Service
 * Handles profile auto-creation for anonymous users
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureProfileExists = ensureProfileExists;
exports.getOrCreateProfileId = getOrCreateProfileId;
const client_1 = require("@/integrations/supabase/client");
/**
 * Ensures a profile exists for the current authenticated user.
 * Creates one if it doesn't exist (for anonymous users).
 *
 * @returns The profile id (same as auth.uid()) or null if not authenticated
 */
async function ensureProfileExists() {
    try {
        const { data: { user } } = await client_1.supabase.auth.getUser();
        if (!user) {
            console.error('No authenticated user');
            return null;
        }
        const userId = user.id;
        // Check if profile exists
        const { data: existingProfile, error: checkError } = await client_1.supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        if (checkError) {
            console.error('Error checking profile:', checkError);
            return null;
        }
        if (existingProfile) {
            return existingProfile.id;
        }
        // Profile doesn't exist - create it
        // Note: The profiles table has id as PK, not auto-generated
        // We need to insert with the user's auth.uid()
        const { data: newProfile, error: insertError } = await client_1.supabase
            .from('profiles')
            .insert({
            id: userId,
            role: 'client',
            full_name: user.email || 'Anonymous User',
            email: user.email || null,
        })
            .select('id')
            .single();
        if (insertError) {
            // Check if it's a unique constraint violation (profile was created by another process)
            if (insertError.code === '23505') {
                return userId;
            }
            console.error('Error creating profile:', insertError);
            return null;
        }
        console.log('Profile auto-created for user:', userId);
        return newProfile.id;
    }
    catch (error) {
        console.error('Failed to ensure profile exists:', error);
        return null;
    }
}
/**
 * Gets the current user's profile ID, creating one if needed
 */
async function getOrCreateProfileId() {
    return ensureProfileExists();
}
