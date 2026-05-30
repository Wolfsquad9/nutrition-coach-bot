import { supabase } from '@/integrations/supabase/client';

const TOKEN_BYTES = 32;

const bytesToHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

export async function hashInvitationToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(digest);
}

export function createInvitationToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function createClientInvitation(input: {
  clientId: string;
  invitedEmail?: string | null;
  expiresAt?: string | null;
}): Promise<{ token: string | null; inviteUrl: string | null; invitationId: string | null; error: string | null }> {
  try {
    const token = createInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const { data, error } = await supabase.rpc('create_client_invitation', {
      p_client_id: input.clientId,
      p_invited_email: input.invitedEmail ?? null,
      p_invite_token_hash: tokenHash,
      p_expires_at: input.expiresAt ?? null,
    });

    if (error) {
      return { token: null, inviteUrl: null, invitationId: null, error: error.message };
    }

    return {
      token,
      inviteUrl: `${window.location.origin}/signup?invite=${encodeURIComponent(token)}`,
      invitationId: data ?? null,
      error: null,
    };
  } catch (error) {
    return {
      token: null,
      inviteUrl: null,
      invitationId: null,
      error: error instanceof Error ? error.message : 'Failed to create client invitation',
    };
  }
}

export async function claimClientInvitation(token: string): Promise<{ clientId: string | null; error: string | null }> {
  try {
    const tokenHash = await hashInvitationToken(token);
    const { data, error } = await supabase.rpc('claim_client_invitation', {
      p_invite_token_hash: tokenHash,
    });

    if (error) {
      return { clientId: null, error: error.message };
    }

    return { clientId: data ?? null, error: null };
  } catch (error) {
    return {
      clientId: null,
      error: error instanceof Error ? error.message : 'Failed to claim client invitation',
    };
  }
}
