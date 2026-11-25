import { useEffect, useState } from 'react';
import { formatDate } from '../../../shared/period';
import { entryLabel, type Entry } from '../components/EntrySheet';
import { Alert, Field } from '../components/Form';
import { MoneyInput } from '../components/MoneyInput';
import { Sheet } from '../components/Sheet';
import { api, ApiError } from '../lib/api';
import { CATEGORY_COLORS, type CategoryColor } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { usePayments, type Card, type PaymentMethod } from '../lib/payments';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

const MAX_CUSTOM = 10; // RN-69
const MAX_CARDS = 10; // RN-51

type Editing =
  | { kind: 'method'; method?: PaymentMethod }
  | { kind: 'card'; card?: Card }
  | { kind: 'invoices'; card: Card }
  | null;

type Invoice = {
  due: string;
  closing: string;
  status: 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID';
  totalCents: number;
  paidCents: number;
  entries: Entry[];
};

const INVOICE_STATUS: Record<Invoice['status'], { label: string; badge: string }> = {
  OPEN: { label: 'Aberta', badge: '' },
  CLOSED: { label: 'Fechada', badge: 'badge--warning' },
  OVERDUE: { label: 'Atrasada', badge: 'badge--danger' },
  PAID: { label: 'Paga', badge: 'badge--success' },
};

/** Formas de pagamento (RN-67 a RN-70) e cartões (RN-51, RN-57), dentro dos ajustes (RN-47a). */
export function PaymentsPage() {
  const { methods, cards, error, reload } = usePayments();
  const [editing, setEditing] = useState<Editing>(null);

  function closeAndReload() {
    setEditing(null);
    void reload();
  }

  const custom = methods?.filter((m) => m.custom) ?? [];
  const defaults = methods?.filter((m) => !m.custom && m.selectable) ?? [];

  return (
    <>
      <Link href="/configuracoes" className="back-link">
        ‹ Ajustes
      </Link>
      <h1>Formas de pagamento e cartões</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {(!methods || !cards) && !error && (
        <p className="muted" role="status">
          Carregando…
        </p>
      )}

      {methods && cards && (
        <div className="settings">
          <section className="card settings__section">
            <div className="section-header">
              <h2>Formas de pagamento</h2>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setEditing({ kind: 'method' })}
                disabled={custom.length >= MAX_CUSTOM}
              >
                + Nova
              </button>
            </div>
            <p className="muted small">
              Toda despesa diz como foi paga. As formas padrão não podem ser alteradas; crie as suas para o que faltar (até{' '}
              {MAX_CUSTOM}).
            </p>
            <ul className="list">
              {defaults.map((method) => (
                <li key={method.id}>
                  <div className="list__item list__item--static">
                    <span className="list__label">{method.name}</span>
                    <span className="muted small">{method.kind === 'CREDIT' ? 'Pede o cartão' : 'Padrão'}</span>
                  </div>
                </li>
              ))}
              {custom.map((method) => (
                <li key={method.id}>
                  <button type="button" className="list__item" onClick={() => setEditing({ kind: 'method', method })}>
                    <span className="list__label">{method.name}</span>
                    <span className="list__action" aria-hidden="true">
                      Editar
                    </span>
                    <span className="visually-hidden">, editar</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card settings__section">
            <div className="section-header">
              <h2>Cartões de crédito</h2>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setEditing({ kind: 'card' })}
                disabled={cards.length >= MAX_CARDS}
              >
                + Novo
              </button>
            </div>
            <p className="muted small">Nas compras no crédito, você escolhe o cartão. O limite e as datas serão usados nas faturas.</p>
            {cards.length === 0 ? (
              <p className="muted small">Nenhum cartão cadastrado.</p>
            ) : (
              <ul className="list">
                {cards.map((card) => (
                  <li key={card.id} data-destaque={`cartao-${card.id}`}>
                    <button type="button" className="list__item" onClick={() => setEditing({ kind: 'card', card })}>
                      <span className="color-dot" style={{ background: CATEGORY_COLORS[card.color].hex }} aria-hidden="true" />
                      <span className="entry__text">
                        <span className="list__label">
                          {card.name} {card.archived && <span className="badge">Arquivado</span>}
                        </span>
                        <span className="muted small">
                          Fecha dia {card.closingDay} · vence dia {card.dueDay}
                        </span>
                        <CardUsage card={card} />
                      </span>
                      <span className="list__action" aria-hidden="true">
                        Editar
                      </span>
                      <span className="visually-hidden">, editar</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {editing?.kind === 'method' && methods && (
        <MethodSheet method={editing.method} methods={methods} onClose={() => setEditing(null)} onSaved={closeAndReload} />
      )}
      {editing?.kind === 'card' && (
        <CardSheet
          card={editing.card}
          onClose={() => setEditing(null)}
          onSaved={closeAndReload}
          onInvoices={(card) => setEditing({ kind: 'invoices', card })}
        />
      )}
      {editing?.kind === 'invoices' && <InvoicesSheet card={editing.card} onClose={closeAndReload} />}
    </>
  );
}

/** RN-69: criar, renomear e excluir formas personalizadas. */
function MethodSheet({
  method,
  methods,
  onClose,
  onSaved,
}: {
  method?: PaymentMethod;
  methods: PaymentMethod[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(method?.name ?? '');
  const [deleting, setDeleting] = useState(false);
  const save = useSubmit(async () => {
    if (method) await api(`/payment-methods/${method.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    else await api('/payment-methods', { method: 'POST', body: JSON.stringify({ name }) });
    onSaved();
  });

  if (method && deleting) {
    return (
      <Sheet title="Excluir forma de pagamento" onClose={onClose}>
        <DeleteMethod method={method} methods={methods} onCancel={() => setDeleting(false)} onDeleted={onSaved} />
      </Sheet>
    );
  }

  return (
    <Sheet title={method ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} onClose={onClose}>
      {save.error && <Alert kind="error">{save.error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field
          label="Nome"
          value={name}
          maxLength={30}
          autoComplete="off"
          placeholder="Ex.: Vale-refeição"
          onChange={(e) => setName(e.target.value)}
          error={save.fieldErrors.name}
        />
        <button className="button" type="submit" disabled={save.submitting}>
          {save.submitting ? 'Salvando…' : 'Salvar'}
        </button>
        {method && (
          <button className="button button--danger-ghost" type="button" onClick={() => setDeleting(true)}>
            Excluir forma de pagamento
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** RN-69: com lançamentos, escolhe para qual forma movê-los (menos Crédito e "Não informada"). */
function DeleteMethod({
  method,
  methods,
  onCancel,
  onDeleted,
}: {
  method: PaymentMethod;
  methods: PaymentMethod[];
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [entriesMessage, setEntriesMessage] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const targets = methods.filter((m) => m.id !== method.id && m.selectable && m.kind !== 'CREDIT');

  const remove = useSubmit(async () => {
    const query = entriesMessage && moveTo !== '' ? `?moveTo=${moveTo}` : '';
    try {
      await api(`/payment-methods/${method.id}${query}`, { method: 'DELETE' });
      onDeleted();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PAYMENT_METHOD_HAS_ENTRIES') {
        setEntriesMessage(error.message);
        return;
      }
      throw error;
    }
  });

  return (
    <form className="form" onSubmit={remove.onSubmit}>
      {remove.error && <Alert kind="error">{remove.error}</Alert>}
      {entriesMessage ? (
        <>
          <p>{entriesMessage}</p>
          <div className="field">
            <label htmlFor="move-method">Mover lançamentos para</label>
            <select id="move-method" value={moveTo} onChange={(e) => setMoveTo(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Escolha uma forma</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            <span className="muted small">Crédito não aparece porque exigiria escolher um cartão para cada lançamento.</span>
          </div>
        </>
      ) : (
        <p>
          Excluir a forma <strong>{method.name}</strong>? Essa ação não pode ser desfeita.
        </p>
      )}
      <button className="button button--danger" type="submit" disabled={remove.submitting || (entriesMessage !== null && moveTo === '')}>
        {remove.submitting ? 'Excluindo…' : entriesMessage ? 'Mover e excluir' : 'Excluir'}
      </button>
      <button className="button button--ghost" type="button" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}

/** RN-51, RN-57: cadastro, edição, arquivamento e exclusão de cartões. */
function CardSheet({
  card,
  onClose,
  onSaved,
  onInvoices,
}: {
  card?: Card;
  onClose: () => void;
  onSaved: () => void;
  onInvoices: (card: Card) => void;
}) {
  const [name, setName] = useState(card?.name ?? '');
  const [color, setColor] = useState<CategoryColor>(card?.color ?? 'purple');
  const [limitCents, setLimitCents] = useState(card?.limitCents ?? 0);
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? ''));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? ''));
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useSubmit(async () => {
    const body = JSON.stringify({ name, color, limitCents, closingDay: Number(closingDay) || 0, dueDay: Number(dueDay) || 0 });
    if (card) await api(`/cards/${card.id}`, { method: 'PATCH', body });
    else await api('/cards', { method: 'POST', body });
    onSaved();
  });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setRemoveError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  const error = save.error ?? removeError;

  return (
    <Sheet title={card ? 'Editar cartão' : 'Novo cartão'} onClose={onClose}>
      {error && <Alert kind="error">{error}</Alert>}
      <form className="form" onSubmit={save.onSubmit} noValidate>
        <Field label="Nome" value={name} maxLength={30} autoComplete="off" placeholder="Ex.: Cartão principal" onChange={(e) => setName(e.target.value)} error={save.fieldErrors.name} />
        <MoneyInput label="Limite" cents={limitCents} onChange={setLimitCents} error={save.fieldErrors.limitCents} />
        <div className="form__row">
          <Field
            label="Dia do fechamento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
            error={save.fieldErrors.closingDay}
          />
          <Field
            label="Dia do vencimento"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            error={save.fieldErrors.dueDay}
          />
        </div>
        <fieldset className="palette">
          <legend>Cor</legend>
          <div className="palette__grid">
            {(Object.keys(CATEGORY_COLORS) as CategoryColor[]).map((key) => (
              <label key={key} className="palette__option" title={CATEGORY_COLORS[key].label}>
                <input type="radio" name="card-color" value={key} checked={color === key} onChange={() => setColor(key)} className="visually-hidden" />
                <span className="palette__swatch" style={{ background: CATEGORY_COLORS[key].hex }} aria-hidden="true" />
                <span className="visually-hidden">{CATEGORY_COLORS[key].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="button" type="submit" disabled={save.submitting || busy}>
          {save.submitting ? 'Salvando…' : 'Salvar'}
        </button>
        {card && (
          <>
            <button className="button button--ghost" type="button" onClick={() => onInvoices(card)}>
              Ver faturas
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={busy}
              onClick={() => void run(() => api(`/cards/${card.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !card.archived }) }))}
            >
              {card.archived ? 'Reativar cartão' : 'Arquivar cartão'}
            </button>
            <button
              className="button button--danger-ghost"
              type="button"
              disabled={busy}
              onClick={() => void run(() => api(`/cards/${card.id}`, { method: 'DELETE' }))}
            >
              Excluir cartão
            </button>
            <p className="muted small">
              Arquivado, o cartão some das compras novas, mas as compras antigas continuam com ele. Só um cartão sem compras pode ser
              excluído.
            </p>
          </>
        )}
      </form>
    </Sheet>
  );
}

/** RN-55: limite usado e disponível, com o alerta do orçamento. */
function CardUsage({ card }: { card: Card }) {
  const percent = Math.min(100, Math.round((card.usedCents / card.limitCents) * 100));
  return (
    <span className={`card-usage card-usage--${card.usageStatus.toLowerCase()}`}>
      <span className="meter" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="small muted">
        Usado {formatMoney(card.usedCents)} de {formatMoney(card.limitCents)} ·{' '}
        {card.availableCents >= 0 ? `disponível ${formatMoney(card.availableCents)}` : <span className="amount--expense">passou {formatMoney(-card.availableCents)}</span>}
        {card.usageStatus === 'WARNING' && <span className="badge badge--warning">Atenção</span>}
        {card.usageStatus === 'EXCEEDED' && <span className="badge badge--danger">Estourado</span>}
      </span>
    </span>
  );
}

/** RN-53, RN-53b, RN-54: as faturas do cartão, com as compras e o pagamento de cada uma. */
function InvoicesSheet({ card, onClose }: { card: Card; onClose: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api<{ invoices: Invoice[] }>(`/cards/${card.id}/invoices`);
      setInvoices(result.invoices);
      // Abre a primeira fatura não paga, que é a que interessa.
      setOpen((current) => current ?? result.invoices.find((i) => i.status !== 'PAID' && i.status !== 'OPEN')?.due ?? result.invoices[0]?.due ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as faturas.');
    }
  }

  useEffect(() => {
    void load();
  }, [card.id]);

  async function toggle(invoice: Invoice) {
    try {
      await api(`/cards/${card.id}/invoices/${invoice.due}`, { method: 'PATCH', body: JSON.stringify({ paid: invoice.status !== 'PAID' }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a fatura.');
    }
  }

  return (
    <Sheet title={`Faturas · ${card.name}`} onClose={onClose}>
      {error && <Alert kind="error">{error}</Alert>}
      {!invoices && !error && (
        <p className="muted" role="status">
          Carregando…
        </p>
      )}
      {invoices && invoices.length === 0 && <p className="muted small">Nenhuma compra neste cartão ainda.</p>}
      {invoices && invoices.length > 0 && (
        <ul className="invoices">
          {invoices.map((invoice) => {
            const status = INVOICE_STATUS[invoice.status];
            const expanded = open === invoice.due;
            return (
              <li key={invoice.due} className="invoice card">
                <button type="button" className="invoice__header" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : invoice.due)}>
                  <span className="entry__text">
                    <span className="list__label">
                      Vence em {formatDate(invoice.due)} <span className={`badge ${status.badge}`}>{status.label}</span>
                    </span>
                    <span className="muted small">
                      Fecha em {formatDate(invoice.closing)} · {invoice.entries.length} {invoice.entries.length === 1 ? 'compra' : 'compras'}
                    </span>
                  </span>
                  <strong>{formatMoney(invoice.totalCents)}</strong>
                </button>
                {expanded && (
                  <div className="invoice__body">
                    <ul className="list">
                      {invoice.entries.map((entry) => (
                        <li key={entry.id} className="invoice__entry">
                          <span>
                            {entryLabel(entry, 'Compra')}
                            <span className="muted small"> · {formatDate(entry.date)}</span>
                          </span>
                          <span className="amount amount--expense">{formatMoney(entry.amountCents)}</span>
                        </li>
                      ))}
                    </ul>
                    <button className={`button ${invoice.status === 'PAID' ? 'button--ghost' : ''}`} type="button" onClick={() => void toggle(invoice)}>
                      {invoice.status === 'PAID' ? 'Marcar como pendente' : `Pagar fatura de ${formatMoney(invoice.totalCents)}`}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
