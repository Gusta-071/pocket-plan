/** Check de pago/recebido (RN-22b): um círculo que marca com um toque. */
export function CheckButton({
  checked,
  overdue,
  label,
  doneLabel = 'pago',
  onToggle,
}: {
  checked: boolean;
  overdue: boolean;
  /** Nome acessível, ex.: "Conta de luz: pago". */
  label: string;
  /** "pago" ou "recebido". */
  doneLabel?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={checked ? 'Marcar como pendente' : `Marcar como ${doneLabel}`}
      className={`check ${checked ? 'check--on' : ''} ${overdue ? 'check--overdue' : ''}`}
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}
