import { useState } from 'react';
import { addMonths, formatDate, maxEntryDate, MIN_ENTRY_DATE, today } from '../../../shared/period';
import { api } from '../lib/api';
import { TYPE_LABELS, type Category, type CategoryType } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { useSubmit } from '../lib/useSubmit';
import { Alert, Field } from './Form';
import { MoneyInput } from './MoneyInput';
import { Sheet } from './Sheet';

export type Entry = {
  id: number;
  type: CategoryType;
  amountCents: number;
  date: string;
  categoryId: number;
  description: string | null;
  /** RN-22: pago (despesa) ou recebido (receita). */
  paid: boolean;
  /** RN-22a: pendente com data passada. */
  overdue: boolean;
};

type Draft = Omit<Entry, 'id' | 'overdue'>;

/** RN-22: sugestão pela data, até o usuário mexer no check. */
const suggestedPaid = (date: string) => date <= today();

export const PAID_LABELS = { EXPENSE: 'Pago', INCOME: 'Recebido' } as const;

export type EntrySheetMode =
  | { kind: 'create'; type: CategoryType }
  | { kind: 'edit'; entry: Entry }
  | { kind: 'duplicate'; entry: Entry };

type Props = {
  mode: EntrySheetMode;
  categories: Category[];
  onClose: () => void;
  /** Chamado após salvar, com a data do lançamento (para mostrar o período certo). */
  onSaved: (date: string) => void;
};

export function EntrySheet({ mode, categories, onClose, onSaved }: Props) {
  const [view, setView] = useState<'form' | 'repeat' | 'delete'>('form');
  const [current, setCurrent] = useState(mode);

  if (current.kind === 'edit' && view === 'repeat') {
    return <RepeatSheet entry={current.entry} onBack={() => setView('form')} onClose={onClose} onDone={() => onSaved(current.entry.date)} />;
  }
  if (current.kind === 'edit' && view === 'delete') {
    return <DeleteSheet entry={current.entry} onBack={() => setView('form')} onClose={onClose} onDone={() => onSaved(current.entry.date)} />;
  }
  return (
    <FormSheet
      key={current.kind}
      mode={current}
      categories={categories}
      onClose={onClose}
      onSaved={onSaved}
      onDuplicate={(entry) => setCurrent({ kind: 'duplicate', entry })}
      onRepeat={() => setView('repeat')}
      onDelete={() => setView('delete')}
    />
  );
}

function initialDraft(mode: EntrySheetMode, categories: Category[]): Draft {
  if (mode.kind !== 'create') {
    const { type, amountCents, date, categoryId, description, paid } = mode.entry;
    // RN-25a: a cópia recebe a situação sugerida pela data, como na criação.
    return { type, amountCents, date, categoryId, description, paid: mode.kind === 'edit' ? paid : suggestedPaid(date) };
  }
  const first = categories.find((c) => c.type === mode.type);
  return { type: mode.type, amountCents: 0, date: today(), categoryId: first?.id ?? 0, description: '', paid: true };
}

function FormSheet({
  mode,
  categories,
  onClose,
  onSaved,
  onDuplicate,
  onRepeat,
  onDelete,
}: Omit<Props, 'mode'> & {
  mode: EntrySheetMode;
  onDuplicate: (entry: Entry) => void;
  onRepeat: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(mode, categories));
  // Na criação e na cópia, o check acompanha a data até o usuário mexer nele (RN-22).
  // Na edição, mudar a data não muda a situação (RN-24).
  const [paidTouched, setPaidTouched] = useState(mode.kind === 'edit');
  const options = categories.filter((c) => c.type === draft.type);

  function changeDate(date: string) {
    setDraft((d) => ({ ...d, date, ...(!paidTouched && date && { paid: suggestedPaid(date) }) }));
  }

  const save = useSubmit(async () => {
    const body = JSON.stringify({ ...draft, description: draft.description?.trim() || null });
    if (mode.kind === 'edit') {
      await api(`/entries/${mode.entry.id}`, { method: 'PUT', body });
    } else {
      await api('/entries', { method: 'POST', body });
    }
    onSaved(draft.date);
  });

  function changeType(type: CategoryType) {
    // RN-21: ao trocar o tipo, a categoria precisa ser do novo tipo.
    const first = categories.find((c) => c.type === type);
    setDraft((d) => ({ ...d, type, categoryId: first?.id ?? 0 }));
  }

  const title =
    mode.kind === 'edit' ? 'Editar lançamento' : mode.kind === 'duplicate' ? 'Duplicar lançamento' : 'Novo lançamento';

  return (
    <Sheet title={title} onClose={onClose}>
      {mode.kind === 'duplicate' && <p className="muted small">Ajuste o que precisar e salve para criar a cópia.</p>}
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <div className="segmented segmented--type" role="radiogroup" aria-label="Tipo">
          {(['EXPENSE', 'INCOME'] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={draft.type === type}
              className={`segmented__option segmented__option--${type.toLowerCase()}`}
              onClick={() => changeType(type)}
            >
              {type === 'EXPENSE' ? 'Despesa' : 'Receita'}
            </button>
          ))}
        </div>

        <MoneyInput
          label="Valor"
          cents={draft.amountCents}
          onChange={(amountCents) => setDraft((d) => ({ ...d, amountCents }))}
          error={save.fieldErrors.amountCents}
        />

        <Field
          label="Data"
          type="date"
          min={MIN_ENTRY_DATE}
          max={maxEntryDate()}
          value={draft.date}
          onChange={(e) => changeDate(e.target.value)}
          error={save.fieldErrors.date}
        />

        <label className="choice">
          <input
            type="checkbox"
            checked={draft.paid}
            onChange={(e) => {
              setPaidTouched(true);
              setDraft((d) => ({ ...d, paid: e.target.checked }));
            }}
          />
          <span>
            <strong>{PAID_LABELS[draft.type]}</strong>
            <span className="muted small">
              {draft.paid
                ? `Já ${draft.type === 'EXPENSE' ? 'saiu da' : 'entrou na'} sua conta.`
                : draft.date < today()
                  ? 'Pendente com data passada: vai aparecer como atrasado.'
                  : `Fica pendente até você marcar como ${PAID_LABELS[draft.type].toLowerCase()}.`}
            </span>
          </span>
        </label>

        <div className="field">
          <label htmlFor="entry-category">Categoria</label>
          <select
            id="entry-category"
            value={draft.categoryId}
            onChange={(e) => setDraft((d) => ({ ...d, categoryId: Number(e.target.value) }))}
            aria-invalid={save.fieldErrors.categoryId ? true : undefined}
          >
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {save.fieldErrors.categoryId && <span className="field__error">{save.fieldErrors.categoryId}</span>}
        </div>

        <Field
          label="Descrição (opcional)"
          maxLength={120}
          autoComplete="off"
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          error={save.fieldErrors.description}
        />

        <button className="button" type="submit" disabled={save.submitting}>
          {save.submitting ? 'Salvando…' : mode.kind === 'duplicate' ? 'Criar cópia' : 'Salvar'}
        </button>

        {mode.kind === 'edit' && (
          <div className="sheet__actions">
            <button className="button button--ghost" type="button" onClick={() => onDuplicate(mode.entry)}>
              Duplicar
            </button>
            <button className="button button--ghost" type="button" onClick={onRepeat}>
              Repetir nos próximos meses
            </button>
            <button className="button button--danger-ghost" type="button" onClick={onDelete}>
              Excluir
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** RN-25b a RN-25d */
function RepeatSheet({ entry, onBack, onClose, onDone }: { entry: Entry; onBack: () => void; onClose: () => void; onDone: () => void }) {
  const [times, setTimes] = useState(1);
  const dates = Array.from({ length: times }, (_, i) => addMonths(entry.date, i + 1));
  const repeat = useSubmit(async () => {
    await api(`/entries/${entry.id}/repeat`, { method: 'POST', body: JSON.stringify({ times }) });
    onDone();
  });

  return (
    <Sheet title="Repetir nos próximos meses" onClose={onClose}>
      <p className="muted small">
        Cria cópias de {formatMoney(entry.amountCents)} no mesmo dia dos meses seguintes. Cada cópia é independente: editar
        ou excluir uma não muda as outras.
      </p>
      {(repeat.error || repeat.fieldErrors.times) && <Alert kind="error">{repeat.error ?? repeat.fieldErrors.times}</Alert>}
      <form className="form" onSubmit={repeat.onSubmit}>
        <div className="field">
          <label htmlFor="repeat-times">Quantas vezes</label>
          <select id="repeat-times" value={times} onChange={(e) => setTimes(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'vez' : 'vezes'}
              </option>
            ))}
          </select>
        </div>
        <p className="preview small">Datas: {dates.map(formatDate).join(', ')}</p>
        <button className="button" type="submit" disabled={repeat.submitting}>
          {repeat.submitting ? 'Criando…' : `Criar ${times} ${times === 1 ? 'cópia' : 'cópias'}`}
        </button>
        <button className="button button--ghost" type="button" onClick={onBack}>
          Voltar
        </button>
      </form>
    </Sheet>
  );
}

/** RN-25 */
function DeleteSheet({ entry, onBack, onClose, onDone }: { entry: Entry; onBack: () => void; onClose: () => void; onDone: () => void }) {
  const remove = useSubmit(async () => {
    await api(`/entries/${entry.id}`, { method: 'DELETE' });
    onDone();
  });

  return (
    <Sheet title="Excluir lançamento" onClose={onClose}>
      {remove.error && <Alert kind="error">{remove.error}</Alert>}
      <form className="form" onSubmit={remove.onSubmit}>
        <p>
          Excluir {TYPE_LABELS[entry.type].singular} de <strong>{formatMoney(entry.amountCents)}</strong> em {formatDate(entry.date)}?
          Essa ação não pode ser desfeita.
        </p>
        <button className="button button--danger" type="submit" disabled={remove.submitting}>
          {remove.submitting ? 'Excluindo…' : 'Excluir'}
        </button>
        <button className="button button--ghost" type="button" onClick={onBack}>
          Cancelar
        </button>
      </form>
    </Sheet>
  );
}
