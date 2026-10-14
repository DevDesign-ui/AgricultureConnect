import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Package, ShoppingBag, CreditCard, MessageSquare, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Notification, supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';

const ICON_MAP: Record<string, typeof Bell> = {
  nouvelle_commande: ShoppingBag,
  validation_commande: CheckCheck,
  annulation_commande: XCircle,
  nouveau_produit: Package,
  message: MessageSquare,
  paiement: CreditCard,
};

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (queryError) {
      setError(`Impossible de charger les notifications : ${queryError.message}`);
    } else {
      setNotifications((data ?? []) as Notification[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refreshNotifications();
    if (!user) return;

    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => void refreshNotifications()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshNotifications, user]);

  const openNotification = async (notification: Notification) => {
    if (!notification.lue) {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ lue: true })
        .eq('id', notification.id)
        .eq('user_id', user?.id);
      if (updateError) {
        setError(`Impossible de marquer la notification comme lue : ${updateError.message}`);
        return;
      }
      setNotifications((previous) => previous.map((item) =>
        item.id === notification.id ? { ...item, lue: true } : item
      ));
    }
    if (notification.type === 'message' && notification.lien?.startsWith('/messages?receiverId=')) {
      navigate(notification.lien);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ lue: true })
      .eq('user_id', user.id)
      .eq('lue', false);
    if (updateError) {
      setError(`Impossible de marquer les notifications comme lues : ${updateError.message}`);
      return;
    }
    setNotifications((previous) => previous.map((notification) => ({ ...notification, lue: true })));
  };

  const unreadCount = notifications.filter((notification) => !notification.lue).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 mt-1">{unreadCount} non lue(s)</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={() => void markAllAsRead()} className="btn-secondary">
            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
          </button>
        )}
      </div>

      {error && (
        <div className="card border border-error-200 bg-error-50 text-error-700" role="alert">
          <p>{error}</p>
          <button type="button" className="mt-3 font-semibold underline" onClick={() => void refreshNotifications()}>
            Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className="card py-12 text-center text-slate-500" role="status">
          Chargement des notifications…
        </div>
      ) : notifications.length === 0 && !error ? (
        <div className="card text-center py-12">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICON_MAP[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                type="button"
                className={`card flex w-full items-start gap-4 text-left cursor-pointer transition-all hover:shadow-md ${
                  !n.lue ? 'border-l-4 border-l-primary-500' : ''
                }`}
                onClick={() => void openNotification(n)}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  n.lue ? 'bg-slate-100' : 'bg-primary-100'
                }`}>
                  <Icon className={`w-5 h-5 ${n.lue ? 'text-slate-400' : 'text-primary-600'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${n.lue ? 'text-slate-700' : 'text-slate-900'}`}>{n.titre}</p>
                    {!n.lue && <span className="w-2 h-2 rounded-full bg-primary-500"></span>}
                  </div>
                  {n.contenu && <p className="text-sm text-slate-500 mt-1">{n.contenu}</p>}
                  <p className="text-xs text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
