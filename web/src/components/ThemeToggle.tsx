import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuth, type User } from '../auth/AuthContext';
import { api } from '../lib/api';
import { applyTheme, currentTheme, markThemeChosenLoggedOut, subscribeTheme, type Theme } from '../lib/theme';

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  {
    value: 'LIGHT',
    label: 'Tema claro',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'DARK',
    label: 'Tema escuro',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
  {
    value: 'SYSTEM',
    label: 'Tema automático (segue o aparelho)',
    icon: (
      <span className="theme-toggle__auto" aria-hidden="true">
        A
      </span>
    ),
  },
];

/**
 * Escolha rápida do tema (RN-45): sol, lua ou "A" (automático). Funciona também antes de entrar;
 * com a conta confirmada, a escolha fica salva nela e vale em todos os aparelhos.
 */
export function ThemeToggle() {
  const { user, setUser } = useAuth();
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  const [saving, setSaving] = useState(false);

  async function choose(next: Theme) {
    if (next === theme || saving) return;
    const previous = theme;
    applyTheme(next);
    // Sem login (ou com o e-mail ainda não confirmado), a escolha fica guardada e vai para a conta ao entrar.
    if (!user?.emailVerified) {
      markThemeChosenLoggedOut();
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ user: User }>('/settings/preferences', { method: 'PATCH', body: JSON.stringify({ theme: next }) });
      setUser(result.user);
    } catch {
      applyTheme(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Tema">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          title={option.label}
          className="theme-toggle__option"
          onClick={() => void choose(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
