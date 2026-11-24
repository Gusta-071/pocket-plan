import { useState } from 'react';
import { formatDate, parseDate, today } from '../../../shared/period';
import { api } from '../lib/api';
import { CATEGORY_COLORS, type Category } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { paymentLabel, type Card, type PaymentMethod } from '../lib/payments';
import { CheckButton } from './CheckButton';
import { entryLabel, PAID_LABELS, type Entry } from './EntrySheet';
import { Alert } from './Form';
import { Sheet } from './Sheet';

/** Uma conta: um lançamento à vista, ou uma fatura inteira de cartão (RN-50d). */
export type BillItem = Entry & { invoice: { cardId: number; due: string; count: number; entries: Entry[] } | null };

const dayMonth = (date: string) => {
  const { day, month } = parseDate(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
};

function dueText(item: BillItem): string {
  const now = today();
  if (item.paid) return `${item.type === 'INCOME' ? 'Recebido' : 'Pago'} · venc. ${dayMonth(item.payDate)}`;
  if (item.payDate === now) return 'Vence hoje';
  return item.payDate < now ? `Venceu em ${dayMonth(item.payDate)}` : `Vence em ${dayMonth(item.payDate)}`;
}

/** RN-54: marca ou desmarca a conta; numa fatura, todas as compras dela. */
export async function toggleBill(item: BillItem) {
  if (item.invoice) {
    await api(`/cards/${item.invoice.cardId}/invoices/${item.invoice.due}`, { method: 'PATCH', body: JSON.stringify({ paid: !item.paid }) });
  } else {
    await api(`/entries/${item.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: !item.paid }) });
  }
}

/** Linha de conta, usada nas Contas do mês e no painel. Tocar abre o lançamento ou as compras da fatura. */
export function BillRow({
  item,
  categories,
  methods,
  cards,
  onToggle,
  onOpen,
  dueOnly = false,
}: {
  item: BillItem;
  categories: Map<number, Category>;
  methods: PaymentMethod[];
  cards: Card[];
  onToggle: () => void;
  onOpen: () => void;
  /** No painel, só o vencimento; nas Contas, também a forma de pagamento. */
  dueOnly?: boolean;
}) {
  const card = item.invoice ? cards.find((c) => c.id === item.invoice!.cardId) : undefined;
  const category = categories.get(item.categoryId);
  const label = item.invoice ? `Fatura ${card?.name ?? 'do cartão'}` : entryLabel(item, category?.name ?? 'Lançamento');
  const done = PAID_LABELS[item.type].toLowerCase();
  const details = item.invoice
    ? `${item.invoice.count} ${item.invoice.count === 1 ? 'compra' : 'compras'}`
    : dueOnly
      ? null
      : paymentLabel(item, methods, cards);
  const color = item.invoice ? (card ? CATEGORY_COLORS[card.color].hex : undefined) : category ? CATEGORY_COLORS[category.color].hex : undefined;

  return (
    <li className={`entry-row bill ${item.paid ? 'bill--paid' : ''}`}>
      <CheckButton checked={item.paid} overdue={item.overdue} label={`${label}: ${done}`} doneLabel={done} onToggle={onToggle} />
      <button type="button" className="list__item entry" onClick={onOpen}>
        <span className={`color-dot ${item.invoice ? 'color-dot--card' : ''}`} style={{ background: color }} aria-hidden="true" />
        <span className="entry__text">
          <span className="list__label bill__label">{label}</span>
          <span className="muted small">
            {[dueText(item), details].filter(Boolean).join(' · ')}
            {item.overdue && <span className="badge badge--danger">Atrasado</span>}
          </span>
        </span>
        <span className={`amount amount--${item.type === 'INCOME' ? 'income' : 'expense'}`}>{formatMoney(item.amountCents)}</span>
      </button>
    </li>
  );
}

/** RN-50d, RN-54: as compras de uma fatura, com o botão de pagar a fatura inteira. */
export function InvoiceSheet({
  item,
  categories,
  cards,
  onClose,
  onChanged,
}: {
  item: BillItem;
  categories: Map<number, Category>;
  cards: Card[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const invoice = item.invoice!;
  const card = cards.find((c) => c.id === invoice.cardId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await toggleBill(item);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a fatura.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Fatura ${card?.name ?? 'do cartão'}`} onClose={onClose}>
      <p className="muted small">
        Vence em {formatDate(invoice.due)} · {invoice.count} {invoice.count === 1 ? 'compra' : 'compras'} ·{' '}
        <strong>{formatMoney(item.amountCents)}</strong>
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      <ul className="list">
        {invoice.entries.map((entry) => {
          const category = categories.get(entry.categoryId);
          return (
            <li key={entry.id}>
              <div className="list__item list__item--static entry">
                <span className="color-dot" style={{ background: category ? CATEGORY_COLORS[category.color].hex : undefined }} aria-hidden="true" />
                <span className="entry__text">
                  <span className="list__label">{entryLabel(entry, category?.name ?? 'Compra')}</span>
                  <span className="muted small">
                    Compra em {formatDate(entry.date)}
                    {category && entry.description ? ` · ${category.name}` : ''}
                  </span>
                </span>
                <span className="amount amount--expense">{formatMoney(entry.amountCents)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <button className={`button ${item.paid ? 'button--ghost' : ''}`} type="button" onClick={() => void toggle()} disabled={busy}>
        {busy ? 'Salvando…' : item.paid ? 'Marcar fatura como pendente' : `Pagar fatura de ${formatMoney(item.amountCents)}`}
      </button>
      <p className="muted small">Para mudar uma compra, abra-a em Lançamentos, no mês em que foi feita.</p>
    </Sheet>
  );
}
