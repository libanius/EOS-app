-- D-110 / COMMS-T05 — realtime-first Comms badge and chat.
--
-- Realtime requires controlled SELECT policies because the browser client must
-- be allowed to receive row changes. Writes remain API-only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'circle_messages'
      AND policyname = 'circle_messages_select_circle_members'
  ) THEN
    CREATE POLICY circle_messages_select_circle_members
      ON public.circle_messages
      FOR SELECT
      TO authenticated
      USING (
        deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.circle_members cm
          WHERE cm.circle_id = circle_messages.circle_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'circle_notifications'
      AND policyname = 'circle_notifications_select_recipient'
  ) THEN
    CREATE POLICY circle_notifications_select_recipient
      ON public.circle_notifications
      FOR SELECT
      TO authenticated
      USING (recipient_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'circle_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'circle_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_notifications;
  END IF;
END $$;
