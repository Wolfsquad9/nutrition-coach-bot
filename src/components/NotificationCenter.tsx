import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Dumbbell, Utensils, Trophy, Calendar, type LucideIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  fetchNotificationSettings,
  upsertNotificationSettings,
  relativeTime,
  type NotificationRow,
  type NotificationIconKey,
} from '@/services/notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/services/notifications/settings';

interface NotificationSettings {
  workoutReminders: boolean;
  mealReminders: boolean;
  progressUpdates: boolean;
  achievements: boolean;
  reminderTime: string;
}

const ICON_MAP: Record<NotificationIconKey, LucideIcon> = {
  Dumbbell,
  Utensils,
  Trophy,
  Calendar,
  Bell,
};

export const NotificationCenter = ({ clientId }: { clientId: string }) => {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    workoutReminders: DEFAULT_NOTIFICATION_SETTINGS.workout_reminders,
    mealReminders: DEFAULT_NOTIFICATION_SETTINGS.meal_reminders,
    progressUpdates: DEFAULT_NOTIFICATION_SETTINGS.progress_updates,
    achievements: DEFAULT_NOTIFICATION_SETTINGS.achievements,
    reminderTime: DEFAULT_NOTIFICATION_SETTINGS.reminder_time,
  });
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Load notifications + settings from Supabase on mount + when client/auth changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated || !clientId) return;
      const [{ data: rows }, { data: dbSettings }] = await Promise.all([
        fetchNotifications(clientId),
        fetchNotificationSettings(clientId),
      ]);
      if (cancelled) return;
      if (rows) setNotifications(rows);
      if (dbSettings) {
        setSettings({
          workoutReminders: dbSettings.workout_reminders,
          mealReminders: dbSettings.meal_reminders,
          progressUpdates: dbSettings.progress_updates,
          achievements: dbSettings.achievements,
          reminderTime: dbSettings.reminder_time.slice(0, 5), // HH:MM:SS -> HH:MM
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId, isAuthenticated]);

  // Mark a single notification as read (DB + optimistic UI)
  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n))
    );
    const { error } = await markNotificationRead(id);
    if (error) {
      toast({
        title: 'Could not mark as read',
        description: error,
        variant: 'destructive',
      });
    }
  };

  // Mark all unread as read (DB + optimistic UI)
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true, read_at: new Date().toISOString() }))
    );
    const { error } = await markAllNotificationsRead(clientId);
    if (error) {
      toast({
        title: 'Could not mark all as read',
        description: error,
        variant: 'destructive',
      });
    }
  };

  // Persist a single setting field to Supabase
  const updateSettings = async <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    const next = { ...settings, [key]: value };
    setSettings(next);

    // Map local field names to DB columns
    const patch: Record<string, unknown> = {};
    if (key === 'workoutReminders') patch.workout_reminders = value;
    else if (key === 'mealReminders') patch.meal_reminders = value;
    else if (key === 'progressUpdates') patch.progress_updates = value;
    else if (key === 'achievements') patch.achievements = value;
    else if (key === 'reminderTime') patch.reminder_time = value;

    const { error } = await upsertNotificationSettings(clientId, patch);
    if (error) {
      toast({
        title: 'Could not save settings',
        description: error,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Settings Updated',
      description: 'Notification preferences have been saved.',
    });
  };

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast({
          title: 'Notifications Enabled',
          description: "You'll now receive browser notifications.",
        });
      }
    }
  }, [toast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return (
    <Card className="p-6 shadow-card">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold text-primary">Smart Notifications</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            Settings
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <Card className="p-4 mb-6 border-2 border-primary/20">
          <h3 className="font-semibold mb-4">Notification Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="workout-reminders" className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4" />
                Workout Reminders
              </Label>
              <Switch
                id="workout-reminders"
                checked={settings.workoutReminders}
                onCheckedChange={(checked) => updateSettings('workoutReminders', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="meal-reminders" className="flex items-center gap-2">
                <Utensils className="w-4 h-4" />
                Meal Reminders
              </Label>
              <Switch
                id="meal-reminders"
                checked={settings.mealReminders}
                onCheckedChange={(checked) => updateSettings('mealReminders', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="progress-updates" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Progress Updates
              </Label>
              <Switch
                id="progress-updates"
                checked={settings.progressUpdates}
                onCheckedChange={(checked) => updateSettings('progressUpdates', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="achievements" className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Achievements
              </Label>
              <Switch
                id="achievements"
                checked={settings.achievements}
                onCheckedChange={(checked) => updateSettings('achievements', checked)}
              />
            </div>
            <Button
              onClick={requestNotificationPermission}
              className="w-full"
            >
              Enable Browser Notifications
            </Button>
          </div>
        </Card>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.map((notification) => {
          const Icon = ICON_MAP[notification.icon] ?? Bell;
          return (
            <div
              key={notification.id}
              className={`p-4 border rounded-lg transition-all cursor-pointer ${
                notification.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'
              }`}
              onClick={() => !notification.read && markAsRead(notification.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-sm border ${
                  notification.read ? 'border-border bg-transparent' : 'border-primary/40 bg-transparent'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    notification.read ? 'text-muted-foreground' : 'text-primary'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`font-medium ${
                        notification.read ? 'text-foreground' : 'text-primary'
                      }`}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(notification.created_at)}
                    </span>
                  </div>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {notifications.length === 0 && (
        <div className="text-center py-8">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No notifications yet</p>
        </div>
      )}
    </Card>
  );
};
