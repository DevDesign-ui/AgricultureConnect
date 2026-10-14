ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_message_id uuid
  REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_message_id_partial_uidx
  ON public.notifications (source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.expediteur_id <> NEW.destinataire_id THEN
    INSERT INTO public.notifications (
      user_id,
      source_message_id,
      type,
      titre,
      contenu,
      lien,
      lue
    )
    VALUES (
      NEW.destinataire_id,
      NEW.id,
      'message',
      'Nouveau message',
      'Vous avez reçu un message',
      '/messages',
      false
    )
    ON CONFLICT (source_message_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_message_notification() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.messages'::regclass
      AND tgname = 'create_message_notification_after_insert'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER create_message_notification_after_insert
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.create_message_notification();
  END IF;
END;
$$;
