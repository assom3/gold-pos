import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AppShell } from '../layout/AppShell';
import { Splash } from '../components/Brand';
import { Button, EmptyState } from '../components/ui/primitives';
import { Lock } from 'lucide-react';

import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Prices from '../pages/Prices';
import Items from '../pages/Items';
import ItemForm from '../pages/ItemForm';
import Sales from '../pages/Sales';
import SaleNew from '../pages/SaleNew';
import SaleDetail from '../pages/SaleDetail';
import Inventory from '../pages/Inventory';
import Stocktake from '../pages/Stocktake';
import StocktakeDetail from '../pages/StocktakeDetail';
import Reports from '../pages/Reports';
import SettingsPage from '../pages/Settings';
import UsersPage from '../pages/Users';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const { isOwner, loading } = useAuth();
  if (loading) return <Splash />;
  if (!isOwner) return <Forbidden />;
  return <>{children}</>;
}

function Forbidden() {
  return (
    <div className="card mx-auto mt-10 max-w-md">
      <EmptyState
        icon={Lock}
        title="هذه الصفحة للمالك فقط"
        description="ليست لديك صلاحية الوصول إلى التقارير أو الإعدادات أو إدارة المستخدمين."
        action={
          <Button variant="primary" onClick={() => window.history.back()}>
            رجوع
          </Button>
        }
      />
    </div>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md">
      <EmptyState
        title="الصفحة غير موجودة"
        description="قد يكون الرابط قديماً أو تمت إزالة الصفحة."
        action={
          <Button variant="primary" onClick={() => window.location.assign('/')}>
            العودة للرئيسية
          </Button>
        }
      />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Splash /> : user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="prices" element={<Prices />} />
        <Route path="items" element={<Items />} />
        <Route path="items/new" element={<ItemForm />} />
        <Route path="items/:id" element={<ItemForm />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<SaleNew />} />
        <Route path="sales/:id" element={<SaleDetail />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="stocktake" element={<Stocktake />} />
        <Route path="stocktake/:id" element={<StocktakeDetail />} />
        <Route
          path="reports"
          element={
            <OwnerOnly>
              <Reports />
            </OwnerOnly>
          }
        />
        <Route
          path="settings"
          element={
            <OwnerOnly>
              <SettingsPage />
            </OwnerOnly>
          }
        />
        <Route
          path="users"
          element={
            <OwnerOnly>
              <UsersPage />
            </OwnerOnly>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
