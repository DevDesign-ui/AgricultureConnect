import { Bell, CheckCheck, Package, ShoppingBag, CreditCard, MessageSquare, XCircle } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
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
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 mt-1">{unreadCount} non lue(s)</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead} className="btn-secondary">
            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICON_MAP[n.type] ?? Bell;
            return (
              <div
                key={n.id}
                className={`card flex items-start gap-4 cursor-pointer transition-all hover:shadow-md ${
                  !n.lue ? 'border-l-4 border-l-primary-500' : ''
                }`}
                onClick={() => !n.lue && markAsRead(n.id)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
