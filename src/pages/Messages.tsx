import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Search, Send, User } from 'lucide-react';
import { supabase, Message, MessagingContact, MessagingRole } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/utils';
import { getSupabaseFunctionErrorMessage } from '../lib/supabase-function-errors';

function isMessagingContact(value: unknown): value is MessagingContact {
  if (typeof value !== 'object' || value === null) return false;
  const contact = value as Record<string, unknown>;
  return typeof contact.user_id === 'string'
    && typeof contact.nom === 'string'
    && typeof contact.prenom === 'string'
    && (contact.role === 'acheteur' || contact.role === 'agriculteur' || contact.role === 'fournisseur');
}

function getRoleLabel(role: MessagingRole): string {
  const labels: Record<MessagingRole, string> = {
    acheteur: 'Acheteur',
    agriculteur: 'Agriculteur',
    fournisseur: 'Fournisseur',
  };
  return labels[role];
}

export default function Messages() {
  const { user } = useAuth();
  const location = useLocation();
  const [contacts, setContacts] = useState<MessagingContact[]>([]);
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [selectedContact, setSelectedContact] = useState<MessagingContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactLoadMessage, setContactLoadMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function fetchInbox() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setContactLoadMessage(null);
      const [contactsResult, messagesResult] = await Promise.allSettled([
        supabase.functions.invoke('messaging-contacts'),
        supabase
          .from('messages')
          .select('*')
          .or(`expediteur_id.eq.${user.id},destinataire_id.eq.${user.id}`)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) return;
      if (contactsResult.status === 'rejected') {
        const reason = contactsResult.reason;
        setContacts([]);
        setContactLoadMessage(
          `Impossible de charger les contacts : ${getSupabaseFunctionErrorMessage(
            reason instanceof Error ? reason : new Error('erreur réseau inconnue'),
            'messaging-contacts'
          )}`
        );
      } else if (contactsResult.value.error) {
        setContacts([]);
        setContactLoadMessage(
          `Impossible de charger les contacts : ${getSupabaseFunctionErrorMessage(
            contactsResult.value.error,
            'messaging-contacts'
          )}`
        );
      } else {
        const rawContacts = contactsResult.value.data?.contacts;
        if (!Array.isArray(rawContacts) || !rawContacts.every(isMessagingContact)) {
          setContacts([]);
          setContactLoadMessage('Le service des contacts a renvoyé une réponse invalide.');
        } else {
          setContacts(rawContacts);
          if (rawContacts.length === 0) {
            setContactLoadMessage('Aucun contact actif n’est actuellement disponible.');
          }
        }
      }
      if (messagesResult.status === 'rejected') {
        setInboxMessages([]);
        setError(
          `Impossible de charger vos conversations : ${
            messagesResult.reason instanceof Error
              ? messagesResult.reason.message
              : 'erreur réseau inconnue'
          }`
        );
      } else if (messagesResult.value.error) {
        setInboxMessages([]);
        setError(`Impossible de charger vos conversations : ${messagesResult.value.error.message}`);
      } else {
        setInboxMessages((messagesResult.value.data ?? []) as Message[]);
      }
      setLoading(false);
    }

    void fetchInbox().catch((fetchError: unknown) => {
      if (active) {
        setContacts([]);
        setContactLoadMessage(
          `Impossible de charger les contacts : ${
            fetchError instanceof Error ? fetchError.message : 'erreur réseau inconnue'
          }`
        );
        setInboxMessages([]);
        setError('Impossible de charger les conversations. Réessayez plus tard.');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const state = location.state as { receiverId?: string } | null;
    if (!state?.receiverId) return;
    if (loading) return;
    if (contactLoadMessage && !contactLoadMessage.startsWith('Aucun contact actif')) return;
    const contact = contacts.find((candidate) => candidate.user_id === state.receiverId);
    if (contact) {
      setSelectedContact(contact);
      setContactLoadMessage(null);
    } else {
      setContactLoadMessage(
        'Le contact demandé n’est pas disponible. Il peut être inactif ou ne pas être un acteur autorisé. Aucun message n’a été envoyé.'
      );
    }
  }, [location.state, contacts, loading, contactLoadMessage]);

  useEffect(() => {
    let active = true;
    if (!user || !selectedContact) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    setError(null);
    const currentUserId = user.id;
    const contactId = selectedContact.user_id;
    const conversationFilter =
      `and(expediteur_id.eq.${currentUserId},destinataire_id.eq.${contactId}),` +
      `and(expediteur_id.eq.${contactId},destinataire_id.eq.${currentUserId})`;

    const addMessage = (message: Message) => {
      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) return previous;
        return [...previous, message].sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        );
      });
    };

    const channel = supabase
      .channel(`messages-${currentUserId}-${contactId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as Message;
        const isConversationMessage =
          (message.expediteur_id === currentUserId && message.destinataire_id === contactId)
          || (message.expediteur_id === contactId && message.destinataire_id === currentUserId);
        if (!isConversationMessage) return;

        addMessage(message);
        setInboxMessages((previous) => [message, ...previous.filter((item) => item.id !== message.id)]);
        if (message.expediteur_id === contactId && !message.lu) {
          void supabase.from('messages').update({ lu: true }).eq('id', message.id).then(({ error: readError }) => {
            if (readError && active) {
              setError(`Impossible de marquer le message comme lu : ${readError.message}`);
            }
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const updatedMessage = payload.new as Message;
        const isConversationMessage =
          (updatedMessage.expediteur_id === currentUserId && updatedMessage.destinataire_id === contactId)
          || (updatedMessage.expediteur_id === contactId && updatedMessage.destinataire_id === currentUserId);
        if (!isConversationMessage) return;
        setMessages((previous) => previous.map((message) =>
          message.id === updatedMessage.id ? updatedMessage : message
        ));
        setInboxMessages((previous) => previous.map((message) =>
          message.id === updatedMessage.id ? updatedMessage : message
        ));
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) {
          setError('La connexion en temps réel est momentanément indisponible. Actualisez la page pour récupérer les nouveaux messages.');
        }
      });

    async function fetchConversation() {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .or(conversationFilter)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (fetchError) {
        setError(`Impossible de charger cette conversation : ${fetchError.message}`);
        setMessagesLoading(false);
        return;
      }

      const conversationMessages = (data ?? []) as Message[];
      setMessages((previous) => {
        const combined = new Map(previous.map((message) => [message.id, message]));
        conversationMessages.forEach((message) => combined.set(message.id, message));
        return [...combined.values()].sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        );
      });
      setInboxMessages((previous) => {
        const combined = new Map(previous.map((message) => [message.id, message]));
        conversationMessages.forEach((message) => combined.set(message.id, message));
        return [...combined.values()].sort(
          (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        );
      });

      const unreadIds = conversationMessages
        .filter((message) => message.destinataire_id === currentUserId && !message.lu)
        .map((message) => message.id);
      if (unreadIds.length > 0) {
        const { error: readError } = await supabase
          .from('messages')
          .update({ lu: true })
          .in('id', unreadIds);
        if (readError && active) {
          setError(`La conversation est chargée, mais les messages n’ont pas pu être marqués comme lus : ${readError.message}`);
        } else if (active) {
          setMessages((previous) => previous.map((message) =>
            unreadIds.includes(message.id) ? { ...message, lu: true } : message
          ));
          setInboxMessages((previous) => previous.map((message) =>
            unreadIds.includes(message.id) ? { ...message, lu: true } : message
          ));
        }
      }
      if (active) setMessagesLoading(false);
    }

    void fetchConversation();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user, selectedContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const contactSummaries = useMemo(() => {
    const summaries = new Map<string, Message>();
    inboxMessages.forEach((message) => {
      const contactId = message.expediteur_id === user?.id
        ? message.destinataire_id
        : message.expediteur_id;
      const latestMessage = summaries.get(contactId);
      if (!latestMessage || new Date(message.created_at) > new Date(latestMessage.created_at)) {
        summaries.set(contactId, message);
      }
    });
    return summaries;
  }, [inboxMessages, user?.id]);

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...contacts]
      .filter((contact) =>
        `${contact.prenom} ${contact.nom} ${getRoleLabel(contact.role)}`
          .toLocaleLowerCase()
          .includes(query)
      )
      .sort((left, right) => {
        const leftDate = contactSummaries.get(left.user_id)?.created_at ?? '';
        const rightDate = contactSummaries.get(right.user_id)?.created_at ?? '';
        return rightDate.localeCompare(leftDate);
      });
  }, [contacts, contactSummaries, search]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = newMessage.trim();
    if (!user || !selectedContact || !content || sending) return;

    setSending(true);
    setError(null);
    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({
        expediteur_id: user.id,
        destinataire_id: selectedContact.user_id,
        contenu: content,
      })
      .select()
      .single();

    if (sendError || !data) {
      setError(`Votre message n’a pas pu être envoyé : ${sendError?.message ?? 'réponse vide du serveur'}`);
      setSending(false);
      return;
    }

    const sentMessage = data as Message;
    setMessages((previous) => previous.some((message) => message.id === sentMessage.id)
      ? previous
      : [...previous, sentMessage]);
    setInboxMessages((previous) => [sentMessage, ...previous.filter((message) => message.id !== sentMessage.id)]);
    setNewMessage('');
    setSending(false);
    const { error: notificationError } = await supabase.functions.invoke('message-notify', {
      body: { messageId: sentMessage.id },
    });
    if (notificationError) {
      const notificationErrorMessage = getSupabaseFunctionErrorMessage(
        notificationError,
        'message-notify'
      );
      setError(`Message envoyé, mais la notification n’a pas pu être créée : ${notificationErrorMessage}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Messagerie</h1>
        <p className="text-slate-500 mt-1">Échangez avec les autres acteurs</p>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          {error}
        </div>
      )}
      {contactLoadMessage && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {contactLoadMessage}
        </div>
      )}

      <div className="flex h-[min(70vh,700px)] min-h-[420px] bg-white rounded-xl border border-slate-200 overflow-hidden">
        <aside className={`${selectedContact ? 'hidden' : 'flex'} w-full md:flex md:w-72 shrink-0 flex-col border-r border-slate-200`}>
          <div className="p-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-2">Contacts</p>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un acteur"
                aria-label="Rechercher un contact"
                className="input w-full pl-9"
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleContacts.length === 0 ? (
              <p className="text-sm text-slate-400 p-4 text-center">
                {search
                  ? 'Aucun contact correspondant'
                  : contactLoadMessage
                    ? 'La liste des contacts ne peut pas être chargée.'
                    : 'Aucun contact actif n’est actuellement disponible.'}
              </p>
            ) : (
              visibleContacts.map((contact) => {
                const summary = contactSummaries.get(contact.user_id);
                return (
                  <button
                    key={contact.user_id}
                    type="button"
                    onClick={() => {
                      setSelectedContact(contact);
                      setNewMessage('');
                    }}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors ${
                      selectedContact?.user_id === contact.user_id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="w-10 h-10 shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{contact.prenom} {contact.nom}</p>
                      </div>
                      <p className="text-xs text-slate-500">{getRoleLabel(contact.role)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={`${selectedContact ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col`}>
          {selectedContact ? (
            <>
              <header className="p-3 md:p-4 border-b border-slate-200 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  aria-label="Retour aux contacts"
                  className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="w-10 h-10 shrink-0 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{selectedContact.prenom} {selectedContact.nom}</p>
                  <p className="truncate text-xs text-slate-500">{getRoleLabel(selectedContact.role)}</p>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messagesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Démarrez la conversation</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isMine = message.expediteur_id === user?.id;
                    return (
                      <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2 rounded-2xl ${
                          isMine ? 'bg-primary-600 text-white' : 'bg-white text-slate-900 border border-slate-200'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{message.contenu}</p>
                          <p className={`text-xs mt-1 ${isMine ? 'text-primary-100' : 'text-slate-400'}`}>
                            {formatDate(message.created_at)}
                            {isMine && message.lu ? ' · Lu' : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="p-3 md:p-4 border-t border-slate-200 flex items-end gap-2">
                <textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Écrivez votre message…"
                  aria-label="Votre message"
                  maxLength={2000}
                  rows={1}
                  className="input min-h-11 max-h-28 flex-1 resize-y"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  aria-label="Envoyer le message"
                  className="btn-primary h-11 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <span className="text-sm">Envoi…</span>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 items-center justify-center text-slate-400 hidden md:flex">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>Sélectionnez un contact pour discuter</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
