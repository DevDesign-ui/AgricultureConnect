import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, MessageSquare, User } from 'lucide-react';
import { supabase, Message, Profile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatDate, createNotification } from '../lib/utils';

export default function Messages() {
  const { user } = useAuth();
  const location = useLocation();
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selectedContact, setSelectedContact] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchContacts() {
      if (!user) return;
      // Get all messages involving the user
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .or(`expediteur_id.eq.${user.id},destinataire_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      // Extract unique contact IDs
      const contactIds = new Set<string>();
      (msgs ?? []).forEach((m: Message) => {
        if (m.expediteur_id === user.id) contactIds.add(m.destinataire_id);
        else contactIds.add(m.expediteur_id);
      });

      // Also add all profiles as potential contacts
      const { data: allProfiles } = await supabase.from('profiles').select('*').neq('user_id', user.id);
      setContacts((allProfiles ?? []) as Profile[]);
      setLoading(false);
    }
    fetchContacts();
  }, [user]);

  // Handle navigation state (from product detail "Contacter")
  useEffect(() => {
    const state = location.state as { receiverId?: string; receiverName?: string } | null;
    if (state?.receiverId) {
      const contact = contacts.find((c) => c.user_id === state.receiverId);
      if (contact) setSelectedContact(contact);
      else if (contacts.length > 0) {
        // Contact not in list yet, create a temp one
        const temp: Profile = {
          id: '',
          user_id: state.receiverId,
          nom: state.receiverName?.split(' ')[1] ?? '',
          prenom: state.receiverName?.split(' ')[0] ?? '',
          email: '',
          telephone: '',
          role: 'agriculteur',
          region: '',
          adresse: '',
          avatar_url: '',
          bio: '',
          latitude: null,
          longitude: null,
          created_at: '',
          updated_at: '',
        };
        setSelectedContact(temp);
      }
    }
  }, [location.state, contacts]);

  useEffect(() => {
    async function fetchMessages() {
      if (!user || !selectedContact) return;
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(expediteur_id.eq.${user.id},destinataire_id.eq.${selectedContact.user_id}),and(expediteur_id.eq.${selectedContact.user_id},destinataire_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      setMessages((data ?? []) as Message[]);

      // Mark received messages as read
      await supabase
        .from('messages')
        .update({ lu: true })
        .eq('expediteur_id', selectedContact.user_id)
        .eq('destinataire_id', user.id)
        .eq('lu', false);
    }
    fetchMessages();

    // Subscribe to new messages
    if (!user || !selectedContact) return;
    const channel = supabase
      .channel(`messages-${selectedContact.user_id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.expediteur_id === selectedContact.user_id && msg.destinataire_id === user.id) {
            setMessages(prev => [...prev, msg]);
            supabase.from('messages').update({ lu: true }).eq('id', msg.id);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, selectedContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedContact || !newMessage.trim()) return;

    const { data } = await supabase.from('messages').insert({
      expediteur_id: user.id,
      destinataire_id: selectedContact.user_id,
      contenu: newMessage.trim(),
      lu: false,
    }).select().single();

    if (data) {
      setMessages(prev => [...prev, data as Message]);
      setNewMessage('');
      // Notify recipient
      await createNotification(
        selectedContact.user_id,
        'message',
        'Nouveau message',
        `Vous avez reçu un message`,
        '/messages'
      );
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

      <div className="flex h-[600px] bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Contacts list */}
        <div className="w-64 border-r border-slate-200 overflow-y-auto hidden md:block">
          <div className="p-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-500">Contacts</p>
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400 p-4 text-center">Aucun contact</p>
          ) : (
            contacts.map((c) => (
              <button
                key={c.user_id}
                onClick={() => setSelectedContact(c)}
                className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors ${
                  selectedContact?.user_id === c.user_id ? 'bg-primary-50' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">{c.prenom} {c.nom}</p>
                  <p className="text-xs text-slate-500">{c.region || 'N/A'}</p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selectedContact ? (
            <>
              <div className="p-4 border-b border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedContact.prenom} {selectedContact.nom}</p>
                  <p className="text-xs text-slate-500">{selectedContact.region || 'N/A'}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Démarrez la conversation</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.expediteur_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                          isMine ? 'bg-primary-600 text-white' : 'bg-white text-slate-900 border border-slate-200'
                        }`}>
                          <p className="text-sm">{msg.contenu}</p>
                          <p className={`text-xs mt-1 ${isMine ? 'text-primary-100' : 'text-slate-400'}`}>
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="p-4 border-t border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Votre message..."
                  className="input flex-1"
                />
                <button type="submit" disabled={!newMessage.trim()} className="btn-primary">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>Sélectionnez un contact pour discuter</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
