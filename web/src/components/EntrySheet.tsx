import { useState } from 'react';
import { installmentAmounts, invoiceFor } from '../../../shared/invoice';
import { addMonths, formatDate, maxEntryDate, MIN_ENTRY_DATE, today } from '../../../shared/period';
import { api } from '../lib/api';
import { EXPENSE_CLASS_LABELS, EXPENSE_CLASSES, TYPE_LABELS, type Category, type CategoryType } from '../lib/categories';
import { formatMoney } from '../lib/money';
import type { Card, PaymentMethod } from '../lib/payments';
import { useSubmit } from '../lib/useSubmit';
import { Alert, Field } from './Form';
import { ManageCategoriesLink, ManagePaymentsLink } from './ManageCategoriesLink';
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
  /** RN-67: forma de pagamento, só nas despesas. */
  paymentMethodId: number | null;
  /** RN-52: cartão, só nas compras no crédito. */
  cardId: number | null;
  /** RN-52a: quando o dinheiro sai; no cartão, o vencimento da fatura. */
  payDate: string;
  /** RN-56: "parcela número de total". */
  installment: { id: number; number: number; count: number } | null;
};

type Draft = Omit<Entry, 'id' | 'overdue' | 'payDate' | 'installment'>;

/** Descrição com a indicação da parcela (RN-56): "Geladeira (3/10)". */
export function entryLabel(entry: Entry, fallback: string): string {
  const base = entry.description || fallback;
  return entry.installment ? `${base} (${entry.installment.number}/${entry.installment.count})` : base;
}

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
  methods: PaymentMethod[];
  cards: Card[];
  onClose: () => void;
  /** Chamado após salvar, com a data do lançamento (para mostrar o período certo) e um aviso, se houver. */
  onSaved: (date: string, warning?: string) => void;
};

export function EntrySheet({ mode, categories, methods, cards, onClose, onSaved }: Props) {
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
      methods={methods}
      cards={cards}
      onClose={onClose}
      onSaved={onSaved}
      onDuplicate={(entry) => setCurrent({ kind: 'duplicate', entry })}
      onRepeat={() => setView('repeat')}
      onDelete={() => setView('delete')}
    />
  );
}

function initialDraft(mode: EntrySheetMode, categories: Category[], methods: PaymentMethod[], cards: Card[]): Draft {
  if (mode.kind !== 'create') {
    const { type, amountCents, date, categoryId, description, paid, paymentMethodId, cardId } = mode.entry;
    const duplicate = mode.kind === 'duplicate';
    // RN-70: a "Não informada" não pode ir para uma cópia; o usuário escolhe uma forma de verdade.
    const unspecified = methods.find((m) => m.id === paymentMethodId)?.selectable === false;
    // RN-57: um cartão arquivado não vai para uma cópia.
    const archivedCard = cards.find((c) => c.id === cardId)?.archived === true;
    return {
      type,
      amountCents,
      date,
      categoryId,
      description,
      // RN-25a: a cópia recebe a situação sugerida pela data, como na criação.
      paid: duplicate ? suggestedPaid(date) : paid,
      paymentMethodId: duplicate && unspecified ? null : paymentMethodId,
      cardId: duplicate && (unspecified || archivedCard) ? null : cardId,
    };
  }
  const first = categories.find((c) => c.type === mode.type);
  // RN-67: nenhuma forma vem marcada; o usuário escolhe.
  return { type: mode.type, amountCents: 0, date: today(), categoryId: first?.id ?? 0, description: '', paid: true, paymentMethodId: null, cardId: null };
}

function FormSheet({
  mode,
  categories,
  methods,
  cards,
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
  const [draft, setDraft] = useState<Draft>(() => initialDraft(mode, categories, methods, cards));
  const original = mode.kind === 'edit' ? mode.entry : null;
  // RN-56: parcelar só na criação; a parcela editada vale para todas (RN-56a).
  const [installments, setInstallments] = useState<{ enabled: boolean; count: string; mode: 'TOTAL' | 'INSTALLMENT' }>({
    enabled: false,
    count: '2',
    mode: 'TOTAL',
  });
  const parcel = original?.installment ?? null;
  const count = Number(installments.count);
  const validCount = Number.isInteger(count) && count >= 2 && count <= 480;
  const parcelling = mode.kind === 'create' && draft.type === 'EXPENSE' && installments.enabled;
  // RN-70 e RN-57: na edição, a despesa antiga mantém a "Não informada" e o cartão arquivado.
  const methodOptions = methods.filter((m) => m.selectable || m.id === original?.paymentMethodId);
  const cardOptions = cards.filter((c) => !c.archived || c.id === original?.cardId);
  const isCredit = draft.type === 'EXPENSE' && methods.find((m) => m.id === draft.paymentMethodId)?.kind === 'CREDIT';
  const chosenCard = isCredit ? cards.find((c) => c.id === draft.cardId) : undefined;
  // RN-53: mostra em que fatura a compra (ou a primeira parcela) vai entrar, com a mesma conta do servidor.
  const invoice = chosenCard && draft.date ? invoiceFor(draft.date, chosenCard.closingDay, chosenCard.dueDay) : null;
  // Na criação e na cópia, o check acompanha a data até o usuário mexer nele (RN-22).
  // Na edição, mudar a data não muda a situação (RN-24).
  const [paidTouched, setPaidTouched] = useState(mode.kind === 'edit');
  const options = categories.filter((c) => c.type === draft.type);

  function changeDate(date: string) {
    setDraft((d) => ({ ...d, date, ...(!paidTouched && date && { paid: suggestedPaid(date) }) }));
  }

  const save = useSubmit(async () => {
    const isExpense = draft.type === 'EXPENSE';
    const body = JSON.stringify({
      ...draft,
      description: draft.description?.trim() || null,
      paymentMethodId: isExpense ? draft.paymentMethodId : null,
      cardId: isExpense && isCredit ? draft.cardId : null,
      ...(parcelling && { installments: { count, mode: installments.mode } }),
    });
    const result =
      mode.kind === 'edit'
        ? await api<{ warning?: string }>(`/entries/${mode.entry.id}`, { method: 'PUT', body })
        : await api<{ warning?: string }>('/entries', { method: 'POST', body });
    onSaved(draft.date, result.warning);
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
      {parcel && (
        <Alert kind="warning">
          Parcela {parcel.number} de {parcel.count}. As alterações valem para todas as parcelas desta compra.
        </Alert>
      )}
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
          label={parcel || (parcelling && installments.mode === 'INSTALLMENT') ? 'Valor da parcela' : parcelling ? 'Valor total' : 'Valor'}
          cents={draft.amountCents}
          onChange={(amountCents) => setDraft((d) => ({ ...d, amountCents }))}
          error={save.fieldErrors.amountCents}
        />

        {mode.kind === 'create' && draft.type === 'EXPENSE' && (
          <InstallmentFields
            value={installments}
            onChange={setInstallments}
            amountCents={draft.amountCents}
            error={save.fieldErrors['installments.count']}
            valid={validCount}
          />
        )}

        {/* RN-19: texto livre para lembrar do que se trata. Fica logo depois do valor para não passar despercebido. */}
        <Field
          label="Descrição (opcional)"
          maxLength={120}
          autoComplete="off"
          placeholder={draft.type === 'EXPENSE' ? 'Ex.: compras do mercado' : 'Ex.: salário de novembro'}
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          error={save.fieldErrors.description}
        />

        <Field
          label="Data"
          type="date"
          min={MIN_ENTRY_DATE}
          max={parcel ? undefined : maxEntryDate()}
          value={draft.date}
          onChange={(e) => changeDate(e.target.value)}
          error={save.fieldErrors.date}
        />

        {/* RN-54: no cartão, o check é o da fatura. */}
        {!isCredit && (
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
        )}

        <div className="field">
          <div className="field__label-row">
            <label htmlFor="entry-category">Categoria</label>
            <ManageCategoriesLink />
          </div>
          <select
            id="entry-category"
            value={draft.categoryId}
            onChange={(e) => setDraft((d) => ({ ...d, categoryId: Number(e.target.value) }))}
            aria-invalid={save.fieldErrors.categoryId ? true : undefined}
          >
            <CategoryOptions categories={options} />
          </select>
          {save.fieldErrors.categoryId && <span className="field__error">{save.fieldErrors.categoryId}</span>}
        </div>

        {draft.type === 'EXPENSE' && (
          <div className="field">
            <div className="field__label-row">
              <label htmlFor="entry-payment">Forma de pagamento</label>
              <ManagePaymentsLink />
            </div>
            <select
              id="entry-payment"
              value={draft.paymentMethodId ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, paymentMethodId: e.target.value ? Number(e.target.value) : null }))}
              aria-invalid={save.fieldErrors.paymentMethodId ? true : undefined}
            >
              <option value="" disabled>
                Escolha
              </option>
              {methodOptions.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
            {save.fieldErrors.paymentMethodId && <span className="field__error">{save.fieldErrors.paymentMethodId}</span>}
          </div>
        )}

        {draft.type === 'EXPENSE' && isCredit && (
          <div className="field">
            <label htmlFor="entry-card">Cartão</label>
            {cardOptions.length === 0 ? (
              <p className="muted small">
                Você ainda não tem cartões. Cadastre um em Ajustes → Formas de pagamento e cartões <ManagePaymentsLink />
              </p>
            ) : (
              <select
                id="entry-card"
                value={draft.cardId ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, cardId: e.target.value ? Number(e.target.value) : null }))}
                aria-invalid={save.fieldErrors.cardId ? true : undefined}
              >
                <option value="" disabled>
                  Escolha o cartão
                </option>
                {cardOptions.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                    {card.archived ? ' (arquivado)' : ''}
                  </option>
                ))}
              </select>
            )}
            {save.fieldErrors.cardId && <span className="field__error">{save.fieldErrors.cardId}</span>}
            {invoice && (
              <span className="muted small">
                {parcelling ? 'A 1ª parcela entra' : 'Entra'} na fatura que fecha em {formatDate(invoice.closing)} e vence em{' '}
                <strong>{formatDate(invoice.due)}</strong>. O pagamento é marcado na fatura, nas Contas do mês.
              </span>
            )}
          </div>
        )}

        <button className="button" type="submit" disabled={save.submitting}>
          {save.submitting ? 'Salvando…' : mode.kind === 'duplicate' ? 'Criar cópia' : 'Salvar'}
        </button>

        {mode.kind === 'edit' && (
          <div className="sheet__actions">
            <button className="button button--ghost" type="button" onClick={() => onDuplicate(mode.entry)}>
              Duplicar
            </button>
            {!parcel && (
              <button className="button button--ghost" type="button" onClick={onRepeat}>
                Repetir nos próximos meses
              </button>
            )}
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
          {entry.installment ? (
            <>
              Excluir o parcelamento inteiro, com as <strong>{entry.installment.count} parcelas</strong> de{' '}
              <strong>{formatMoney(entry.amountCents)}</strong>? Essa ação não pode ser desfeita.
            </>
          ) : (
            <>
              Excluir {TYPE_LABELS[entry.type].singular} de <strong>{formatMoney(entry.amountCents)}</strong> em {formatDate(entry.date)}?
              Essa ação não pode ser desfeita.
            </>
          )}
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

/** Opções de categoria; as de despesa ficam agrupadas pela classe (RN-14a). */
function CategoryOptions({ categories }: { categories: Category[] }) {
  const option = (category: Category) => (
    <option key={category.id} value={category.id}>
      {category.name}
    </option>
  );
  if (categories.every((c) => c.expenseClass === null)) return <>{categories.map(option)}</>;
  return (
    <>
      {EXPENSE_CLASSES.map((expenseClass) => {
        const ofClass = categories.filter((c) => c.expenseClass === expenseClass);
        return ofClass.length === 0 ? null : (
          <optgroup key={expenseClass} label={EXPENSE_CLASS_LABELS[expenseClass].plural}>
            {ofClass.map(option)}
          </optgroup>
        );
      })}
    </>
  );
}

/** RN-56: parcelar a despesa. O usuário informa a parcela ou o total, e o outro é calculado. */
function InstallmentFields({
  value,
  onChange,
  amountCents,
  error,
  valid,
}: {
  value: { enabled: boolean; count: string; mode: 'TOTAL' | 'INSTALLMENT' };
  onChange: (value: { enabled: boolean; count: string; mode: 'TOTAL' | 'INSTALLMENT' }) => void;
  amountCents: number;
  error?: string;
  valid: boolean;
}) {
  const count = Number(value.count);
  const amounts = value.enabled && valid && amountCents > 0 ? installmentAmounts(amountCents, count, value.mode) : null;
  const total = amounts?.reduce((sum, a) => sum + a, 0) ?? 0;
  return (
    <div className="installments">
      <label className="choice">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        <span>
          <strong>Parcelado</strong>
          <span className="muted small">Cria uma parcela por mês, ligadas entre si.</span>
        </span>
      </label>
      {value.enabled && (
        <div className="installments__fields">
          <Field
            label="Número de parcelas"
            type="number"
            inputMode="numeric"
            min={2}
            max={480}
            value={value.count}
            onChange={(e) => onChange({ ...value, count: e.target.value })}
            error={error ?? (valid ? undefined : 'Escolha de 2 a 480 parcelas.')}
          />
          <div className="segmented" role="radiogroup" aria-label="O valor informado é">
            {(
              [
                ['TOTAL', 'Informei o total'],
                ['INSTALLMENT', 'Informei a parcela'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={value.mode === mode}
                className="segmented__option"
                onClick={() => onChange({ ...value, mode })}
              >
                {label}
              </button>
            ))}
          </div>
          {amounts && (
            <p className="preview small">
              {count} × {formatMoney(amounts[amounts.length - 1]!)}
              {amounts[0] !== amounts[amounts.length - 1] && ` (a 1ª de ${formatMoney(amounts[0]!)})`} = <strong>{formatMoney(total)}</strong>
              {value.mode === 'INSTALLMENT' && ' no total, com os juros'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
