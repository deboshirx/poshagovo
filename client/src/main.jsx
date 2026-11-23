import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';
import Layout from './components/Layout';
import Catalog from './pages/Catalog';
import GuidePage from './pages/GuidePage';
import Player from './pages/Player';
import PrintPage from './pages/PrintPage';
import Login from './pages/Login';
import Cabinet from './pages/Cabinet';
import Editor from './pages/Editor';
import Stats from './pages/Stats';
import NotFound from './pages/NotFound';
import { flushEvents } from './offline';
import './styles.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW не зарегистрирован', err));
}

// если в прошлый раз что-то не отправилось — пробуем сейчас
flushEvents();

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/embed/:id" element={<Player embedded />} />
        <Route path="/g/:id/print" element={<PrintPage />} />

        <Route element={<Layout />}>
          <Route index element={<Catalog />} />
          <Route path="g/:id" element={<GuidePage />} />
          <Route path="g/:id/run" element={<Player />} />
          <Route path="login" element={<Login />} />
          <Route path="me" element={<RequireAuth><Cabinet /></RequireAuth>} />
          <Route path="me/new" element={<RequireAuth><Editor /></RequireAuth>} />
          <Route path="me/guides/:id/edit" element={<RequireAuth><Editor /></RequireAuth>} />
          <Route path="me/guides/:id/stats" element={<RequireAuth><Stats /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  </BrowserRouter>,
);
