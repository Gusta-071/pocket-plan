import { useState } from 'react';
import { useAuth, type User } from '../auth/AuthContext';

/** Tela inicial provisória: o resumo do período entra nas próximas funcionalidades. */
export function HomePage({ user }: { user: User }) {
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

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
        <span className="topbar__user">
          <span className="topbar__name">{user.name}</span>
          <button className="button button--ghost" type="button" onClick={handleLogout} disabled={leaving}>
            Sair
          </button>
        </span>
      </header>
      <main className="content">
        <h1>Olá, {user.name.split(' ')[0]}!</h1>
        <p className="muted">Sua conta está pronta. Em breve, aqui aparece o resumo do seu mês financeiro.</p>
      </main>
    </div>
  );
}
