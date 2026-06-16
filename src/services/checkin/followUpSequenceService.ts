/**
 * Follow-Up Sequence Service
 *
 * Orchestrates follow-up sequences for clients who haven't checked in.
 * Integrates with the notification service and WhatsApp edge function.
 *
 * Functions:
 * - triggerFollowUpSequence: checks last checkin, sends notifications/WhatsApp
 * - getSequenceHistory: returns follow_up_sent alerts for a client
 * - toggleSequenceForClient: enables/disables follow-up for a client
 */
import { supabase } from '@/integrations/supabase/client';
import { createNotification } from '@/services/notifications';
import { generateAlert } from '@/services/checkin/alertService';
import type { CoachAlert } from '@/types/checkin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOLLOW_UP_24H_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_72H_THRESHOLD_MS = 72 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// triggerFollowUpSequence
// ---------------------------------------------------------------------------

/**
 * Trigger a follow-up sequence for a client.
 *
 * Logic:
 * 1. Check if follow_up_enabled is true for the client
 * 2. Fetch the last checkin timestamp
 * 3. If >24h: send in-app notification + queue WhatsApp via send-whatsapp edge function
 * 4. If >72h: use escalation message variant
 * 5. Log to coach_alerts with type='follow_up_sent'
 */
export async function triggerFollowUpSequence(
  clientId: string,
  coachId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // 1. Check if follow-up is enabled for this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('follow_up_enabled, first_name, last_name, phone')
      .eq('id', clientId)
      .single();

    if (clientError) {
      return { success: false, error: `Failed to fetch client: ${clientError.message}` };
    }

    if (!client.follow_up_enabled) {
      return { success: false, error: 'Follow-up is disabled for this client' };
    }

    // 2. Fetch the last checkin timestamp
    const { data: streak, error: streakError } = await supabase
      .from('checkin_streaks')
      .select('last_checkin_date')
      .eq('client_id', clientId)
      .maybeSingle();

    if (streakError) {
      return { success: false, error: `Failed to fetch streak: ${streakError.message}` };
    }

    const lastCheckinDate = streak?.last_checkin_date;
    if (!lastCheckinDate) {
      // No checkin ever — send initial follow-up
      return await sendFollowUp(clientId, coachId, client, 'initial');
    }

    const lastCheckin = new Date(lastCheckinDate + 'T00:00:00Z');
    const now = new Date();
    const hoursSinceCheckin = (now.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCheckin > FOLLOW_UP_72H_THRESHOLD_MS / (1000 * 60 * 60)) {
      // >72h: escalation
      return await sendFollowUp(clientId, coachId, client, 'escalation');
    } else if (hoursSinceCheckin > FOLLOW_UP_24H_THRESHOLD_MS / (1000 * 60 * 60)) {
      // >24h: standard follow-up
      return await sendFollowUp(clientId, coachId, client, 'standard');
    }

    // Within 24h — no follow-up needed
    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to trigger follow-up sequence',
    };
  }
}

// ---------------------------------------------------------------------------
// Internal: sendFollowUp
// ---------------------------------------------------------------------------

type FollowUpVariant = 'initial' | 'standard' | 'escalation';

async function sendFollowUp(
  clientId: string,
  coachId: string,
  client: { first_name: string | null; last_name: string | null; phone: string | null },
  variant: FollowUpVariant
): Promise<{ success: boolean; error: string | null }> {
  const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'your client';

  // Build message based on variant
  let title: string;
  let message: string;
  let whatsappMessage: string;

  switch (variant) {
    case 'initial':
      title = 'Check-in Reminder';
      message = `It's been a while since ${clientName} checked in. Send them a friendly reminder!`;
      whatsappMessage = `Hi ${clientName}! Just checking in — don't forget to log your daily check-in today. Your coach is here to support you! 💪`;
      break;
    case 'standard':
      title = 'Follow-up: Missing Check-in';
      message = `${clientName} hasn't checked in for over 24 hours. Consider reaching out.`;
      whatsappMessage = `Hi ${clientName}! We noticed you haven't checked in today. Your coach wants to make sure you're on track — take a moment to log your progress! 📊`;
      break;
    case 'escalation':
      title = 'Escalation: Extended Absence';
      message = `${clientName} hasn't checked in for over 72 hours. This needs immediate attention.`;
      whatsappMessage = `Hi ${clientName}! Your coach is concerned — it's been a few days since your last check-in. Let's get back on track together! 🚀`;
      break;
  }

  // 1. Create in-app notification
  const { error: notifError } = await createNotification({
    clientId,
    type: 'system',
    title,
    message,
    icon: 'Bell',
  });

  if (notifError) {
    console.error('Failed to create notification:', notifError);
  }

  // 2. Queue WhatsApp via send-whatsapp edge function (if phone available)
  if (client.phone) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const response = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientPhone: client.phone,
            planData: { message: whatsappMessage },
            planType: 'follow_up',
          }),
        });

        if (!response.ok) {
          console.error('WhatsApp send failed:', await response.text());
        }
      }
    } catch (whatsappErr) {
      console.error('WhatsApp queue error:', whatsappErr);
    }
  }

  // 3. Log to coach_alerts with type='follow_up_sent'
  const { error: alertError } = await generateAlert({
    client_id: clientId,
    trainer_id: coachId,
    alert_type: 'system',
    severity: variant === 'escalation' ? 'red' : 'yellow',
    title,
    message,
    metadata: {
      variant,
      follow_up_type: 'follow_up_sent',
      client_name: clientName,
      phone: client.phone,
    },
  });

  if (alertError) {
    console.error('Failed to log follow-up alert:', alertError);
  }

  return { success: true, error: null };
}

// ---------------------------------------------------------------------------
// getSequenceHistory
// ---------------------------------------------------------------------------

/**
 * Get follow-up sequence history for a client.
 * Returns coach_alerts filtered by type='system' and metadata.follow_up_type='follow_up_sent'.
 */
export async function getSequenceHistory(
  clientId: string
): Promise<{ alerts: CoachAlert[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('coach_alerts')
      .select('*')
      .eq('client_id', clientId)
      .eq('alert_type', 'system')
      .order('created_at', { ascending: false });

    if (error) {
      return { alerts: [], error: error.message };
    }

    // Filter to only follow_up_sent alerts (check metadata)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const followUpAlerts = (data ?? []).filter((a: any) => {
      if (!a.metadata || typeof a.metadata !== 'object') return false;
      return a.metadata.follow_up_type === 'follow_up_sent';
    }) as unknown as CoachAlert[];

    return { alerts: followUpAlerts, error: null };
  } catch (err: unknown) {
    return {
      alerts: [],
      error: err instanceof Error ? err.message : 'Failed to fetch sequence history',
    };
  }
}

// ---------------------------------------------------------------------------
// toggleSequenceForClient
// ---------------------------------------------------------------------------

/**
 * Enable or disable follow-up sequence for a client.
 * Uses the follow_up_enabled column on the clients table.
 */
export async function toggleSequenceForClient(
  clientId: string,
  enabled: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('clients')
      .update({ follow_up_enabled: enabled })
      .eq('id', clientId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to toggle follow-up sequence',
    };
  }
}