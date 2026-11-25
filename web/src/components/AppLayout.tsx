import { useState, type ReactNode } from 'react';
import { useAuth, type User } from '../auth/AuthContext';
import { Link, useLocation } from '../lib/router';
import { useHighlight } from '../lib/useHighlight';
import { NotificationBell } from './NotificationBell';

const NAV_ITEMS = [
  { href: '/', label: 'Início', icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  {
    href: '/lancamentos',
    label: 'Lançamentos',
    icon: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <circle cx="3.5" cy="6" r="1" />
        <circle cx="3.5" cy="12" r="1" />
        <circle cx="3.5" cy="18" r="1" />
      </>
    ),
  },
  {
    href: '/contas',
    label: 'Contas',
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    href: '/configuracoes',
    label: 'Ajustes',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
  },
];

/** A seção fica marcada também nas telas dentro dela (ex.: categorias, dentro dos ajustes). */
function isCurrent(href: string, path: string): boolean {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

/** Estrutura da área logada: barra do topo e navegação (no topo no PC, embaixo no celular). */
export function AppLayout({ user, children }: { user: User; children: ReactNode }) {
  const { logout } = useAuth();
  const { path } = useLocation();
  const [leaving, setLeaving] = useState(false);
  // RN-72c: destaca o item indicado por um aviso.
  useHighlight();

  async function handleLogout() {
    setLeaving(true);
    await logout().catch(() => setLeaving(false));
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">
          <img src="/logo.png" alt="" width={28} height={28} /> pocket-plan
        </span>
        <nav className="nav" aria-label="Seções">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav__item"
              aria-current={isCurrent(item.href, path) ? 'page' : undefined}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <span className="topbar__user">
          {/* RN-72: central de avisos, no topo em todas as telas. */}
          <NotificationBell />
          <span className="topbar__name">{user.name}</span>
          <button className="button button--ghost" type="button" onClick={handleLogout} disabled={leaving}>
            Sair
          </button>
        </span>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
