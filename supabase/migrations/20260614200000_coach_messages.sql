CREATE TABLE public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'manual'
    CHECK (type IN ('manual','automated')),
  trigger_event text DEFAULT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- Client reads own messages via JWT metadata
CREATE POLICY "client_reads_own_messages" ON public.coach_messages
  FOR SELECT USING (
    client_id::text = (auth.jwt() -> 'user_metadata' ->> 'client_id')
  );

-- Coach full access to own messages
CREATE POLICY "coach_manages_messages" ON public.coach_messages
  FOR ALL USING (coach_id = auth.uid());

CREATE INDEX idx_coach_messages_client
  ON public.coach_messages(client_id, created_at DESC);
CREATE INDEX idx_coach_messages_unread
  ON public.coach_messages(client_id) WHERE is_read = false;
