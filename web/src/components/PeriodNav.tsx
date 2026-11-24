import { formatDate, type Period } from '../../../shared/period';

/** Navegação entre períodos financeiros (RN-11, RN-12): ‹ anterior · nome e datas · próximo ›. */
export function PeriodNav({ period, offset, onChange }: { period: Period; offset: number; onChange: (offset: number) => void }) {
  return (
    <>
      <nav className="period-nav" aria-label="Período">
        <button type="button" className="period-nav__arrow" aria-label="Período anterior" onClick={() => onChange(offset - 1)}>
          ‹
        </button>
        <div className="period-nav__label">
          <strong>{period.label}</strong>
          <span className="muted small">
            {formatDate(period.start)} a {formatDate(period.end)}
          </span>
        </div>
        <button type="button" className="period-nav__arrow" aria-label="Próximo período" onClick={() => onChange(offset + 1)}>
          ›
        </button>
      </nav>
      {offset !== 0 && (
        <button type="button" className="link-button period-nav__today" onClick={() => onChange(0)}>
          Voltar ao período atual
        </button>
      )}
    </>
  );
}
