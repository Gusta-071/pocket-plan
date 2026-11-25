export type Theme = 'LIGHT' | 'DARK' | 'SYSTEM';

const STORAGE_KEY = 'pp-theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let current: Theme = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'SYSTEM';
const listeners = new Set<() => void>();

function paint() {
  const dark = current === 'DARK' || (current === 'SYSTEM' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#13201f' : '#0f766e');
}

/**
 * Aplica o tema (RN-45). No automático, acompanha o tema do aparelho mesmo com o app aberto.
 * A última escolha fica guardada no navegador para a tela não piscar ao abrir.
 */
export function applyTheme(theme: Theme) {
  current = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  paint();
  listeners.forEach((listener) => listener());
}

const PENDING_KEY = 'pp-theme-pending';

/** Marca que o tema foi escolhido sem login (telas de entrada): ao entrar, ele vale e vai para a conta. */
export function markThemeChosenLoggedOut() {
  localStorage.setItem(PENDING_KEY, '1');
}

/** O tema foi escolhido sem login e ainda não foi salvo na conta? */
export function hasPendingTheme(): boolean {
  return localStorage.getItem(PENDING_KEY) === '1';
}

export function clearPendingTheme() {
  localStorage.removeItem(PENDING_KEY);
}

/** Tema escolhido agora (para os botões de tema ficarem em sincronia). */
export function currentTheme(): Theme {
  return current;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

darkQuery.addEventListener('change', paint);
paint();
