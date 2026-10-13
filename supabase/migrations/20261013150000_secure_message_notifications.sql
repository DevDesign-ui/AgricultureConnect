-- Keep message notifications tied to a persisted message and prevent client
-- inserts from choosing the system-owned message reference.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_message_id uuid
  REFERENCES public.messages(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_message_id_uidx
  ON public.notifications (source_message_id);

DROP POLICY IF EXISTS "ac_notifications_insert_boundary" ON public.notifications;
CREATE POLICY "ac_notifications_insert_boundary"
ON public.notifications
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND type <> 'message'
);

REVOKE INSERT ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, user_id, titre, contenu, type, lue, lien, created_at, source_message_id)
  ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, titre, contenu, type, lue, lien)
  ON TABLE public.notifications TO authenticated;

REVOKE UPDATE ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, user_id, titre, contenu, type, lue, lien, created_at, source_message_id)
  ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT UPDATE (lue) ON TABLE public.notifications TO authenticated;
