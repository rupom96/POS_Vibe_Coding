import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isEmbeddedMode } from '../config/runtimeConfig';
import { PosPage } from '../modules/pos/pages/PosPage';
import { HomePage } from '../pages/HomePage';
import { RemoteScanPage } from '../pages/RemoteScanPage';
import { AppLayout } from '../shared/layout/AppLayout';

export function AppRoutes() {
  const embedded = isEmbeddedMode();
  const home = embedded ? <Navigate to="/pos" replace /> : <HomePage />;
  const fallback = <Navigate to={embedded ? '/pos' : '/'} replace />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/remote-scan/:sessionId" element={<RemoteScanPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={home} />
          <Route path="/pos" element={<PosPage />} />
        </Route>
        <Route path="*" element={fallback} />
      </Routes>
    </BrowserRouter>
  );
}