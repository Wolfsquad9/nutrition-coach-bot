import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Dumbbell, Utensils, Trophy, Calendar, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  type: 'workout' | 'meal' | 'progress' | 'achievement';
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: any;
}

interface NotificationSettings {
  workoutReminders: boolean;
  mealReminders: boolean;
  progressUpdates: boolean;
  achievements: boolean;
  reminderTime: string;
}

export const NotificationCenter = ({ clientId }: { clientId: string }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    workoutReminders: true,
    mealReminders: true,
    progressUpdates: true,
    achievements: true,
    reminderTime: '09:00'
  });
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem(`notifications_settings_${clientId}`);
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Initialize with sample notifications
    const sampleNotifications: Notification[] = [
      {
        id: '1',
        type: 'workout',
        title: 'Time to Train!',
        message: 'Upper Body workout scheduled for today',
        time: '08:00',
        read: false,
        icon: Dumbbell
      },
      {
        id: '2',
        type: 'meal',
        title: 'Meal Prep Reminder',
        message: 'Don\'t forget to prepare tomorrow\'s meals',
        time: '18:00',
        read: false,
        icon: Utensils
      },
      {
        id: '3',
        type: 'achievement',
        title: 'Milestone Reached!',
        message: 'You\'ve completed 10 workouts this month',
        time: 'Yesterday',
        read: true,
        icon: Trophy
      },
      {
        id: '4',
        type: 'progress',
        title: 'Weekly Check-in',
        message: 'Time to log your weekly progress',
        time: '2 days ago',
        read: true,
        icon: Calendar
      }
    ];
    setNotifications(sampleNotifications);

    // Simulate real-time notifications
    if (settings.workoutReminders) {
      const timer = setTimeout(() => {
        sendNotification('workout', 'Workout Reminder', 'Time for your afternoon session!');
      }, 10000); // Send after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [clientId, settings.workoutReminders]);

  const sendNotification = (type: any, title: string, message: string) => {
    const iconMap = {
      workout: Dumbbell,
      meal: Utensils,
      progress: Calendar,
      achievement: Trophy
    };

    const newNotification: Notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      time: 'Just now',
      read: false,
      icon: iconMap[type as keyof typeof iconMap]
    };

    setNotifications(prev => [newNotification, ...prev]);
    
    // Browser notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/favicon.ico'
      });
    }

    toast({
      title,
      description: message,
    });
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, read: true }))
    );
  };

  const updateSettings = (key: keyof NotificationSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem(`notifications_settings_${clientId}`, JSON.stringify(newSettings));
    
    toast({
      title: "Settings Updated",
      description: "Notification preferences have been saved.",
    });
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast({
          title: "Notifications Enabled",
          description: "You'll now receive browser notifications.",
        });
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Card className="p-6 shadow-card">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold text-primary">Smart Notifications</h2>
          {unreadCount > 0 && (
            <Badge className="bg-destructive text-white">{unreadCount}</Badge>
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
              className="w-full bg-gradient-primary text-white"
            >
              Enable Browser Notifications
            </Button>
          </div>
        </Card>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.map(notification => {
          const Icon = notification.icon;
          return (
            <div
              key={notification.id}
              className={`p-4 border rounded-lg transition-all cursor-pointer ${
                notification.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'
              }`}
              onClick={() => markAsRead(notification.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${
                  notification.read ? 'bg-muted' : 'bg-primary/10'
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
                      {notification.time}
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