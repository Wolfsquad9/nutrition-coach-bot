/**
 * Notification types — shared between service and UI.
 *
 * Persisted to Supabase table `notifications` (see migration 2026xxxx_notifications.sql).
 * The `icon` field is a string key resolved to a Lucide icon on the client side,
 * because Lucide components cannot be serialized to JSON.
 */

export type NotificationType = 'workout' | 'meal' | 'progress' | 'achievement' | 'system';

export type NotificationIconKey = 'Dumbbell' | 'Utensils' | 'Trophy' | 'Calendar' | 'Bell';

export interface NotificationRow {
  id: string;
  client_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  icon: NotificationIconKey;
  created_at: string;
  read_at: string | null;
}

/** Shape used by the UI — adds a relative `time` string for display. */
export interface NotificationView extends NotificationRow {
  time: string;
}
