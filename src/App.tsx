import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import MyProducts from './pages/MyProducts';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Payments from './pages/Payments';
import MapView from './pages/MapView';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import type { UserRole } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const dashboardPaths: Record<UserRole, string> = {
  admin: '/dashboard/admin',
  agriculteur: '/dashboard/agriculteur',
  fournisseur: '/dashboard/fournisseur',
  acheteur: '/dashboard/acheteur',
};

function RoleDashboardRedirect() {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return <Navigate to={dashboardPaths[profile.role]} replace />;
}

function RoleDashboardRoute({ role }: { role: UserRole }) {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (profile.role !== role) {
    return <Navigate to={dashboardPaths[profile.role]} replace />;
  }

  return <Dashboard />;
}

function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={dashboardPaths[profile.role]} replace />;
  }

  return <>{children}</>;
}

const allRoles: UserRole[] = ['admin', 'agriculteur', 'fournisseur', 'acheteur'];
const sellerRoles: UserRole[] = ['admin', 'agriculteur', 'fournisseur'];
const buyerRoles: UserRole[] = ['admin', 'acheteur'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<RoleDashboardRedirect />} />
        <Route path="dashboard/admin" element={<RoleDashboardRoute role="admin" />} />
        <Route path="dashboard/agriculteur" element={<RoleDashboardRoute role="agriculteur" />} />
        <Route path="dashboard/fournisseur" element={<RoleDashboardRoute role="fournisseur" />} />
        <Route path="dashboard/acheteur" element={<RoleDashboardRoute role="acheteur" />} />
        <Route path="products" element={<RoleRoute allowedRoles={allRoles}><Products /></RoleRoute>} />
        <Route path="products/:id" element={<RoleRoute allowedRoles={allRoles}><ProductDetail /></RoleRoute>} />
        <Route path="my-products" element={<RoleRoute allowedRoles={sellerRoles}><MyProducts /></RoleRoute>} />
        <Route path="orders" element={<RoleRoute allowedRoles={allRoles}><Orders /></RoleRoute>} />
        <Route path="orders/:id" element={<RoleRoute allowedRoles={allRoles}><OrderDetail /></RoleRoute>} />
        <Route path="payments" element={<RoleRoute allowedRoles={buyerRoles}><Payments /></RoleRoute>} />
        <Route path="map" element={<RoleRoute allowedRoles={allRoles}><MapView /></RoleRoute>} />
        <Route path="messages" element={<RoleRoute allowedRoles={allRoles}><Messages /></RoleRoute>} />
        <Route path="notifications" element={<RoleRoute allowedRoles={allRoles}><Notifications /></RoleRoute>} />
        <Route path="profile" element={<RoleRoute allowedRoles={allRoles}><Profile /></RoleRoute>} />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
