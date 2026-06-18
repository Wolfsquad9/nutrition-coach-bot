/**
 * Notifications service — Supabase-backed CRUD for in-app notifications
 * and per-client notification settings.
 *
 * Replaces the localStorage-based approach in NotificationCenter.tsx.
 * All functions return `{ data, error }` shape so callers can surface failures
 * via the existing `useToast` hook.
 *
 * RLS: every function is scoped by `client_id` which is also passed to
 * Supabase. The matching RLS policies (see migration) restrict reads/writes
 * to the row's owner.
 */

import { supabase } from '@/integrations/supabase/client';
import type { NotificationRow, NotificationType, NotificationIconKey } from './types';
export type { NotificationRow, NotificationIconKey };
import type { NotificationSettingsRow, NotificationScope } from './settings';
import { DEFAULT_NOTIFICATION_SETTINGS } from './settings';

// ---------------------------------------------------------------------------
// Notifications CRUD
// ---------------------------------------------------------------------------

export async function fetchNotifications(
  clientId: string,
  limit = 50
): Promise<{ data: NotificationRow[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { data: null, error: error.message };
    return { data: (data ?? []) as NotificationRow[], error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function markAllNotificationsRead(
  clientId: string
): Promise<{ count: number; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('read', false)
      .select('id');

    if (error) return { count: 0, error: error.message };
    return { count: data?.length ?? 0, error: null };
  } catch (err: unknown) {
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export interface CreateNotificationInput {
  clientId: string;
  type: NotificationType;
  title: string;
  message: string;
  icon?: NotificationIconKey;
}

/**
 * Server-side helper to create a notification. Called from edge functions
 * (e.g. after adherence check-in, weekly summary, etc.).
 * From the client, you typically call this via an edge function — not directly —
 * to keep business logic out of the browser bundle.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<{ data: NotificationRow | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        client_id: input.clientId,
        type: input.type,
        title: input.title,
        message: input.message,
        icon: input.icon ?? defaultIconFor(input.type),
        read: false,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as NotificationRow, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function fetchNotificationSettings(
  clientId: string,
  scope: NotificationScope = 'in_app'
): Promise<{ data: NotificationSettingsRow | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('client_id', clientId)
      .eq('scope', scope)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: (data as NotificationSettingsRow) ?? null, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function upsertNotificationSettings(
  clientId: string,
  patch: Partial<Omit<NotificationSettingsRow, 'client_id' | 'scope' | 'updated_at'>>,
  scope: NotificationScope = 'in_app'
): Promise<{ data: NotificationSettingsRow | null; error: string | null }> {
  try {
    const merged = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      client_id: clientId,
      scope,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('notification_settings')
      .upsert(merged, { onConflict: 'client_id,scope' })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as NotificationSettingsRow, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultIconFor(type: NotificationType): NotificationIconKey {
  switch (type) {
    case 'workout': return 'Dumbbell';
    case 'meal': return 'Utensils';
    case 'progress': return 'Calendar';
    case 'achievement': return 'Trophy';
    case 'system': return 'Bell';
  }
}

/**
 * Convert an absolute timestamp to a short human-readable relative time.
 * Pure function so it's unit-testable in isolation.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (Number.isNaN(diffMs)) return '';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
