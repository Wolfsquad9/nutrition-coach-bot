/**
 * Notification settings — per-client preferences.
 *
 * Replaces the previous `localStorage` approach in NotificationCenter.tsx
 * (which stored under key `notifications_settings_${clientId}`).
 * One row per (client_id, scope) — scope lets us later add per-channel settings
 * (e.g. email vs push) without a schema change.
 */

export type NotificationScope = 'in_app' | 'email' | 'push';

export interface NotificationSettingsRow {
  client_id: string;
  scope: NotificationScope;
  workout_reminders: boolean;
  meal_reminders: boolean;
  progress_updates: boolean;
  achievements: boolean;
  reminder_time: string; // HH:mm in client's local time
  updated_at: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettingsRow, 'client_id' | 'updated_at'> = {
  scope: 'in_app',
  workout_reminders: true,
  meal_reminders: true,
  progress_updates: true,
  achievements: true,
  reminder_time: '09:00',
};
