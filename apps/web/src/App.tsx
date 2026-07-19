import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import ExportsPage from './pages/ExportsPage';
import CrmPage from './pages/CrmPage';

function ProtectedLayout({ session }: { session: Session }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Lead CRM</h2>
        <small>Inteligência comercial B2B</small>

        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/leads">Gerar Leads</Link>
          <Link to="/crm">Mini CRM</Link>
          <Link to="/exports">Exportações</Link>
          <button type="button" onClick={handleLogout}>
            Sair
          </button>
        </nav>

        <p className="user-email">{session.user.email}</p>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/exports" element={<ExportsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return <div className="content">Carregando...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        path="/*"
        element={
          session ? (
            <ProtectedLayout session={session} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
