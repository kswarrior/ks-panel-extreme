import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './context/AuthContext';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const TablePage = lazy(() => import('./pages/TablePage'));
const PanelPage = lazy(() => import('./pages/PanelPage'));

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loader">Checking access…</div>;
  if (!isAdmin) {
    return (
      <Navigate
        to="/overview"
        replace
        state={{ login: true, from: location.pathname }}
      />
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route
          path="map"
          element={
            <AdminRoute>
              <MapPage />
            </AdminRoute>
          }
        />
        <Route
          path="table"
          element={
            <AdminRoute>
              <TablePage />
            </AdminRoute>
          }
        />
        <Route
          path="panels/:panelId"
          element={
            <AdminRoute>
              <PanelPage />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
