import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { applyTheme, type Theme } from '../lib/theme';
import type { PeriodNaming } from '../../../shared/period';

export type User = {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  monthStartDay: number;
  periodNaming: PeriodNaming;
  theme: Theme;
  /** RN-44a: ponto de partida do saldo acumulado, em centavos (pode ser negativo). */
  initialBalanceCents: number;
  /** RN-32a: nível de atenção do orçamento, em % do limite. */
  warningPercent: number;
  /** RN-72b: dias que um aviso dispensado fica fora do sino. */
  noticeSnoozeDays: number;
};

type AuthState = {
  /** `undefined` enquanto a sessão está sendo verificada. */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Busca de novo o usuário da sessão (ex.: depois de confirmar o e-mail). */
  refresh: () => Promise<void>;
  /** Atualiza o usuário com a resposta da API (ex.: depois de salvar as configurações). */
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  // O tema salvo na conta vale em todos os aparelhos (RN-45).
  useEffect(() => {
    if (user) applyTheme(user.theme);
  }, [user]);

  const refresh = useCallback(async () => {
    await api<{ user: User }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null)); // sem sessão válida (RN-08)
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setUser(result.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setUser(result.user); // RN-08b: já entra logado
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, register, logout, refresh, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return context;
}
