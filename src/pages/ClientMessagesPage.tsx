/**
 * ClientMessagesPage — client-facing messages page.
 *
 * Minimal placeholder that displays messages from the coach_messages table.
 * Integrates cleanly with the router. Can be enhanced later without routing changes.
 */
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface CoachMessage {
  id: string;
  client_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function ClientMessagesPage() {
  const { clientId, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated || !clientId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from('coach_messages')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (!error && data) {
        setMessages(data as CoachMessage[]);
      }
      setLoading(false);
    }

    fetchMessages();

    return () => { cancelled = true; };
  }, [clientId, isAuthenticated, isAuthLoading]);

  if (isAuthLoading || loading) {
    return (
      <Card className="p-12 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated || !clientId) {
    return (
      <Card className="p-6 shadow-card">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold text-primary">Messages</h2>
          <p className="text-muted-foreground">Please sign in to view messages.</p>
        </div>
      </Card>
    );
  }

  const unreadCount = messages.filter(m => !m.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-primary">Messages</h2>
        {unreadCount > 0 && (
          <Badge variant="destructive">{unreadCount} unread</Badge>
        )}
      </div>

      <div className="space-y-3">
        {messages.length === 0 && (
          <Card className="p-6 shadow-card">
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground text-center">
                No messages yet. Your coach will send you messages here.
              </p>
            </div>
          </Card>
        )}

        {messages.map((message) => (
          <Card
            key={message.id}
            className={`p-4 shadow-sm transition-all ${!message.is_read ? 'border-primary/30 bg-primary/5' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!message.is_read ? 'font-semibold' : 'text-muted-foreground'}`}>
                  {message.message}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(message.created_at).toLocaleDateString()}
              </span>
            </div>
            {!message.is_read && (
              <div className="mt-2">
                <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}