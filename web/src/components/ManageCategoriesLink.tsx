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

export const PAYMENTS_PATH = '/configuracoes/pagamentos';

/** Atalho para as formas de pagamento e os cartões, que ficam nos ajustes (RN-47a, RN-51, RN-69). */
export function ManagePaymentsLink() {
  return (
    <Link href={PAYMENTS_PATH} className="icon-link" title="Gerenciar formas de pagamento e cartões" aria-label="Gerenciar formas de pagamento e cartões">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    </Link>
  );
}
