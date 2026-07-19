import { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate
} from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import ExportsPage from './pages/ExportsPage';
import CrmPage from './pages/CrmPage';

type Theme = 'light' | 'dark';

type MenuItem = {
  path: string;
  label: string;
  description: string;
  icon: string;
  end?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    description: 'Visão geral',
    icon: '⌂',
    end: true
  },
  {
    path: '/leads',
    label: 'Gerar Leads',
    description: 'Nova prospecção',
    icon: '◎'
  },
  {
    path: '/crm',
    label: 'Pipeline Comercial',
    description: 'Gestão de oportunidades',
    icon: '▣'
  },
  {
    path: '/exports',
    label: 'Exportações',
    description: 'Histórico de arquivos',
    icon: '⇩'
  }
];

function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem('lead-crm-theme');

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function ThemeButton({
  theme,
  onToggle,
  className = ''
}: {
  theme: Theme;
  onToggle: () => void;
  className?: string;
}) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`app-theme-button ${className}`.trim()}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo noturno'}
      title={isDark ? 'Ativar modo claro' : 'Ativar modo noturno'}
      onClick={onToggle}
    >
      <span className="app-theme-button-icon" aria-hidden="true">
        {isDark ? '☀' : '☾'}
      </span>

      <span className="app-theme-button-label">
        {isDark ? 'Modo claro' : 'Modo noturno'}
      </span>
    </button>
  );
}

function ProtectedLayout({
  session,
  theme,
  onToggleTheme
}: {
  session: Session;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('lead-crm-sidebar-collapsed') === 'true';
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const displayName = useMemo(() => {
    const metadataName = session.user.user_metadata?.name;

    if (typeof metadataName === 'string' && metadataName.trim()) {
      return metadataName.trim();
    }

    return 'Usuário';
  }, [session.user.user_metadata]);

  const userInitial = displayName.charAt(0).toUpperCase();

  const currentPage = useMemo(() => {
    return (
      MENU_ITEMS.find((item) => {
        if (item.path === '/') {
          return location.pathname === '/';
        }

        return location.pathname.startsWith(item.path);
      }) || MENU_ITEMS[0]
    );
  }, [location.pathname]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  function toggleSidebar() {
    setSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;

      localStorage.setItem(
        'lead-crm-sidebar-collapsed',
        String(nextValue)
      );

      return nextValue;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div
      className={[
        'app-shell',
        sidebarCollapsed ? 'is-sidebar-collapsed' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={[
          'sidebar-overlay',
          mobileSidebarOpen ? 'is-visible' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Fechar menu"
        onClick={() => setMobileSidebarOpen(false)}
      />

      <aside
        className={[
          'app-sidebar',
          mobileSidebarOpen ? 'is-mobile-open' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="sidebar-header">
          <NavLink to="/" className="sidebar-brand" aria-label="Lead CRM">
            <span className="sidebar-brand-logo">L</span>

            <span className="sidebar-brand-text">
              <strong>Lead CRM</strong>
              <small>Inteligência B2B</small>
            </span>
          </NavLink>

          <button
            type="button"
            className="sidebar-mobile-close"
            aria-label="Fechar menu"
            onClick={() => setMobileSidebarOpen(false)}
          >
            ×
          </button>

          <button
            type="button"
            className="sidebar-collapse-button"
            aria-label={
              sidebarCollapsed
                ? 'Expandir barra lateral'
                : 'Recolher barra lateral'
            }
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <div className="sidebar-section-label">
          <span>Menu principal</span>
        </div>

        <nav className="sidebar-navigation">
          {MENU_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              title={sidebarCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                [
                  'sidebar-navigation-link',
                  isActive ? 'is-active' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              <span className="sidebar-navigation-icon">{item.icon}</span>

              <span className="sidebar-navigation-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>

              <span className="sidebar-active-indicator" />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-account">
          <ThemeButton
            theme={theme}
            onToggle={onToggleTheme}
            className="sidebar-theme-button"
          />

          <div className="sidebar-user">
            <span className="sidebar-user-avatar">{userInitial}</span>

            <span className="sidebar-user-copy">
              <strong>{displayName}</strong>
              <small>{session.user.email}</small>
            </span>
          </div>

          <button
            type="button"
            className="sidebar-logout-button"
            title={sidebarCollapsed ? 'Sair' : undefined}
            onClick={handleLogout}
          >
            <span className="sidebar-logout-icon">↪</span>
            <span className="sidebar-logout-text">Sair da plataforma</span>
          </button>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <button
              type="button"
              className="mobile-menu-button"
              aria-label="Abrir menu"
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="app-page-identification">
              <span>{currentPage.description}</span>
              <strong>{currentPage.label}</strong>
            </div>
          </div>

          <div className="app-topbar-right">
            <div className="app-online-status">
              <span />
              Sistema online
            </div>

            <ThemeButton theme={theme} onToggle={onToggleTheme} />

            <div className="app-topbar-avatar" title={session.user.email}>
              {userInitial}
            </div>
          </div>
        </header>

        <main className="app-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/exports" element={<ExportsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </section>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lead-crm-theme', theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === 'dark' ? 'light' : 'dark'
    );
  }

  if (session === undefined) {
    return (
      <div className="app-session-loading">
        <div className="app-session-spinner" />
        <strong>Lead CRM</strong>
        <span>Carregando sua plataforma...</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <>
              <ThemeButton
                theme={theme}
                onToggle={toggleTheme}
                className="public-theme-button"
              />
              <LoginPage />
            </>
          )
        }
      />

      <Route
        path="/*"
        element={
          session ? (
            <ProtectedLayout
              session={session}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
