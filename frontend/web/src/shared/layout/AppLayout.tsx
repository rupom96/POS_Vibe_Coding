import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { isEmbeddedMode } from '../../config/runtimeConfig';
import { posSession } from '../../config/posSession';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { toggleNav, toggleTheme } from '../../app/uiSlice';
import { mainNavItems } from './navigation';
import '../styles/appLayout.css';

export function AppLayout() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.ui.theme);
  const navOpen = useAppSelector((s) => s.ui.navOpen);
  const location = useLocation();
  const isPos = location.pathname.startsWith('/pos');
  const embedded = isEmbeddedMode();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (embedded) {
    return (
      <div className="app-shell app-shell--embedded">
        <main className="app-content app-content--embedded">
          <div className={`app-page${isPos ? ' app-page--flush' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${navOpen ? '' : ' collapsed'}`}>
        <div className="app-sidebar-brand">
          <div className="brand-icon">D</div>
          <div className="app-sidebar-brand-text">
            <div className="brand-name">DataBiz</div>
            <div className="brand-sub">Business Suite</div>
          </div>
        </div>

        <nav className="app-nav" aria-label="Main navigation">
          <div className="app-nav-label">Modules</div>
          {mainNavItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
            >
              <span className="app-nav-icon">{item.icon}</span>
              <span className="app-nav-text">
                {item.label}
                {item.description ? <small>{item.description}</small> : null}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sidebar-foot">
          <button type="button" className="app-nav-toggle" onClick={() => dispatch(toggleNav())}>
            {navOpen ? '◀ Collapse' : '▶'}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-topbar-menu-btn"
            aria-label="Toggle navigation"
            onClick={() => dispatch(toggleNav())}
          >
            ☰
          </button>

          <div className="app-topbar-spacer" />

          <div className="app-meta-chip" title={posSession.companyName}>
            <span>🏢</span>
            <span>{posSession.companyName}</span>
          </div>
          <div className="app-meta-chip" title={posSession.locationName}>
            <span>📍</span>
            <span>{posSession.locationName}</span>
          </div>

          <button type="button" className="theme-toggle" onClick={() => dispatch(toggleTheme())}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          <div className="user-chip">
            <div className="user-av">{posSession.securityUserName.charAt(0)}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{posSession.securityUserName}</span>
          </div>
        </header>

        <main className={`app-content${isPos ? '' : ''}`}>
          <div className={`app-page${isPos ? ' app-page--flush' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
