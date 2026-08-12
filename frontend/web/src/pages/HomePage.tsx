import { Link } from 'react-router-dom';
import { mainNavItems } from '../shared/layout/navigation';

export function HomePage() {
  const modules = mainNavItems.filter((item) => item.path !== '/');

  return (
    <div>
      <div className="app-page-head">
        <h1 className="app-page-title">Dashboard</h1>
        <p className="app-page-sub">Welcome to DataBiz — select a module to get started</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {modules.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            style={{
              padding: '18px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'var(--accent-dim2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.background = 'var(--surface)';
            }}
          >
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{item.label}</span>
            {item.description ? (
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{item.description}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
