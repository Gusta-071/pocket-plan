import { useState, type ReactNode } from 'react';
import { saveBudget, type BudgetTarget, type Budgets } from '../lib/budgets';
import { useSubmit } from '../lib/useSubmit';
import { Alert } from './Form';
import { MoneyInput } from './MoneyInput';
import { Sheet } from './Sheet';

/**
 * Edição de um limite ou de uma meta: salvar ou remover. Vale do período atual em diante,
 * e os períodos anteriores mantêm o valor que tinham (RN-30).
 */
export function BudgetAmountSheet({
  title,
  label,
  description,
  target,
  currentCents,
  onClose,
  onSaved,
}: {
  title: string;
  label: string;
  description: ReactNode;
  target: BudgetTarget;
  currentCents: number | null;
  onClose: () => void;
  onSaved: (budgets: Budgets) => void;
}) {
  const [cents, setCents] = useState(currentCents ?? 0);
  const save = useSubmit(async () => onSaved(await saveBudget(target, cents)));
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setRemoveError(null);
    try {
      onSaved(await saveBudget(target, null));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Não foi possível remover.');
    } finally {
      setRemoving(false);
    }
  }

  const error = save.error ?? removeError;

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted small">{description}</p>
      {error && <Alert kind="error">{error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <MoneyInput label={label} cents={cents} onChange={setCents} error={save.fieldErrors.amountCents} />
        <p className="muted small">Vale a partir deste mês. Os meses anteriores continuam com o valor que tinham.</p>
        <button className="button" type="submit" disabled={save.submitting || cents === 0 || cents === currentCents}>
          {save.submitting ? 'Salvando…' : 'Salvar'}
        </button>
        {currentCents !== null && (
          <button className="button button--danger-ghost" type="button" onClick={() => void remove()} disabled={removing}>
            {removing ? 'Removendo…' : 'Remover'}
          </button>
        )}
      </form>
    </Sheet>
  );
}
