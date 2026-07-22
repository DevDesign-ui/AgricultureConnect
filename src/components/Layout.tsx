import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  CreditCard,
  MapPin,
  MessageSquare,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Sprout,
  Settings,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { getRoleLabel } from '../lib/utils';

export default function Layout() {
  const { profile, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { to: '/products', label: 'Produits', icon: Package },
    ...(profile?.role === 'agriculteur' || profile?.role === 'fournisseur' || profile?.role === 'admin'
      ? [{ to: '/my-products', label: 'Mes produits', icon: Sprout }]
      : []),
    { to: '/orders', label: 'Commandes', icon: ShoppingBag },
    { to: '/payments', label: 'Paiements', icon: CreditCard },
    { to: '/map', label: 'Carte', icon: MapPin },
    { to: '/messages', label: 'Messagerie', icon: MessageSquare },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/profile', label: 'Mon profil', icon: User },
    ...(profile?.role === 'admin'
      ? [{ to: '/admin', label: 'Administration', icon: Settings }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-slate-200 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">AgriConnect</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem)]">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="bg-error-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          ))}

          <div className="pt-4 mt-4 border-t border-slate-200">
            <div className="px-3 py-2">
              <p className="text-xs text-slate-500">Connecté en tant que</p>
              <p className="text-sm font-semibold text-slate-900">
                {profile?.prenom} {profile?.nom}
              </p>
              <p className="text-xs text-primary-600 font-medium">{getRoleLabel(profile?.role ?? '')}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-error-600 hover:bg-error-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Déconnexion
            </button>
          </div>
        </nav>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">AgriConnect</span>
          </div>
          <NavLink to="/notifications" className="relative text-slate-600">
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-error-500 text-white text-xs rounded-full px-1.5 font-bold">
                {unreadCount}
              </span>
            )}
          </NavLink>
        </header>

        <main className="p-4 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
