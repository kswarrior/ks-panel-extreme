import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const TablePage = lazy(() => import('./pages/TablePage'));
const PanelPage = lazy(() => import('./pages/PanelPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="table" element={<TablePage />} />
        <Route path="panels/:panelId" element={<PanelPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
