import { Link } from '../lib/router';

export const CATEGORIES_PATH = '/configuracoes/categorias';

/**
 * Atalho para as categorias, que ficam nos ajustes (RN-47a).
 * No PC, a descrição aparece ao parar o mouse sobre o ícone; no celular, o toque já abre a tela.
 */
export function ManageCategoriesLink() {
  return (
    <Link href={CATEGORIES_PATH} className="icon-link" title="Gerenciar categorias" aria-label="Gerenciar categorias">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </svg>
    </Link>
  );
}
