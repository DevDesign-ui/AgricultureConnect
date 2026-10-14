ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_message_id uuid
  REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_message_id_uidx
  ON public.notifications (source_message_id);

DROP INDEX IF EXISTS public.notifications_source_message_id_partial_uidx;

CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF NEW.expediteur_id IS DISTINCT FROM NEW.destinataire_id THEN
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
      '/messages?receiverId=' || NEW.expediteur_id::text,
      false
    )
    ON CONFLICT (source_message_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.create_message_notification() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_message_notification()
  FROM PUBLIC, anon, authenticated;
