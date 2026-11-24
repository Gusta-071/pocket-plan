import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, formatDate, parseDate, periodContaining, shiftPeriod, today } from '../../../shared/period';
import type { User } from '../auth/AuthContext';
import { EntrySheet, PAID_LABELS, type Entry, type EntrySheetMode } from '../components/EntrySheet';
import { CheckButton } from '../components/CheckButton';
import { Alert } from '../components/Form';
import { PeriodNav } from '../components/PeriodNav';
import { api } from '../lib/api';
import { CATEGORY_COLORS, type Category, type CategoryType } from '../lib/categories';
import { formatMoney, formatSigned } from '../lib/money';
import { paymentLabel, usePayments } from '../lib/payments';
import { useCategories } from '../lib/useCategories';

type Totals = {
  incomePaid: number;
  incomePending: number;
  expensePaid: number;
  expensePending: number;
  result: number;
  projected: number;
  overdueCount: number;
};

const WEEKDAYS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];

function dayHeading(date: string): string {
  const now = today();
  if (date === now) return 'Hoje';
  if (date === addDays(now, -1)) return 'Ontem';
  if (date === addDays(now, 1)) return 'Amanhã';
  const { year, month, day } = parseDate(date);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${formatDate(date).slice(0, 5)}`;
}

/** Quantos períodos separam a data do período atual (para ir direto ao período de um lançamento). */
function offsetOf(date: string, user: User): number {
  const target = parseDate(periodContaining(date, user.monthStartDay, user.periodNaming).start);
  const current = parseDate(periodContaining(today(), user.monthStartDay, user.periodNaming).start);
  return (target.year - current.year) * 12 + (target.month - current.month);
}

export function EntriesPage({ user }: { user: User }) {
  const { categories, error: categoriesError } = useCategories();
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<CategoryType | 'ALL'>('ALL');
  const [categoryId, setCategoryId] = useState<number | 'ALL'>('ALL');
  // RN-71: "m:<id>" filtra por forma de pagamento; "c:<id>", por cartão.
  const [payment, setPayment] = useState<string>('ALL');
  const { methods, cards } = usePayments();
  const [data, setData] = useState<{ entries: Entry[]; totals: Totals } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<EntrySheetMode | null>(null);

  const period = shiftPeriod(today(), offset, user.monthStartDay, user.periodNaming);

  // Número da última busca: ao trocar de período ou filtro rápido, respostas de buscas
  // antigas podem chegar depois da atual e são descartadas.
  const lastRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    const params = new URLSearchParams({ start: period.start, end: period.end });
    if (type !== 'ALL') params.set('type', type);
    if (categoryId !== 'ALL') params.set('categoryId', String(categoryId));
    if (payment.startsWith('m:')) params.set('paymentMethodId', payment.slice(2));
    if (payment.startsWith('c:')) params.set('cardId', payment.slice(2));
    try {
      const result = await api<{ entries: Entry[]; totals: Totals }>(`/entries?${params}`);
      if (request !== lastRequest.current) return;
      setData(result);
      setLoadError(null);
    } catch (err) {
      if (request !== lastRequest.current) return;
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os lançamentos.');
    }
  }, [period.start, period.end, type, categoryId, payment]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map<number, Category>((categories ?? []).map((c) => [c.id, c]));
  const filterOptions = (categories ?? []).filter((c) => type === 'ALL' || c.type === type);

  function changeType(next: CategoryType | 'ALL') {
    setType(next);
    if (next === 'INCOME') setPayment('ALL');
    // A categoria escolhida pode não existir no novo tipo.
    if (categoryId !== 'ALL' && next !== 'ALL' && byId.get(categoryId)?.type !== next) setCategoryId('ALL');
  }

  function handleSaved(date: string) {
    setSheet(null);
    const target = offsetOf(date, user);
    if (target !== offset) setOffset(target);
    else void load();
  }

  const groups: { date: string; entries: Entry[] }[] = [];
  for (const entry of data?.entries ?? []) {
    const last = groups.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }

  /**
   * RN-22b: marca/desmarca direto na lista. O check muda na hora; os totais vêm da API em seguida.
   * Se a API falhar, o check volta ao que era.
   */
  async function togglePaid(entry: Entry) {
    const paid = !entry.paid;
    const patch = (value: boolean) =>
      setData((current) =>
        current && {
          ...current,
          entries: current.entries.map((e) => (e.id === entry.id ? { ...e, paid: value, overdue: !value && e.date < today() } : e)),
        },
      );
    patch(paid);
    try {
      await api(`/entries/${entry.id}/paid`, { method: 'PATCH', body: JSON.stringify({ paid }) });
      void load();
    } catch (err) {
      patch(entry.paid);
      setLoadError(err instanceof Error ? err.message : 'Não foi possível atualizar o lançamento.');
    }
  }

  const totals = data?.totals;
  const hasPending = totals ? totals.incomePending + totals.expensePending > 0 : false;

  return (
    <>
      <div className="page-header wide-header">
        <h1>Lançamentos</h1>
        <div className="wide-header__period">
          <PeriodNav period={period} offset={offset} onChange={setOffset} />
        </div>
      </div>

      {/* No PC: a lista à esquerda; totais e filtros numa coluna fixa à direita. */}
      <div className="entries">
        <div className="entries__side">
          {totals && type !== 'ALL' && (
            // Filtrando um tipo só, "resultado" não faz sentido: mostra o pago, o pendente e o total desse tipo.
            <section className="card summary" aria-label="Totais do período">
              {(() => {
                const kind = type === 'INCOME' ? 'income' : 'expense';
                const paid = type === 'INCOME' ? totals.incomePaid : totals.expensePaid;
                const pending = type === 'INCOME' ? totals.incomePending : totals.expensePending;
                return (
                  <>
                    <div>
                      <span className="muted small">{type === 'INCOME' ? 'Recebido' : 'Pago'}</span>
                      <strong className={`amount amount--${kind}`}>{formatMoney(paid)}</strong>
                    </div>
                    <div>
                      <span className="muted small">{type === 'INCOME' ? 'A receber' : 'A pagar'}</span>
                      <strong className="amount">{formatMoney(pending)}</strong>
                    </div>
                    <div>
                      <span className="muted small">Total</span>
                      <strong className={`amount amount--${kind}`}>{formatMoney(paid + pending)}</strong>
                    </div>
                  </>
                );
              })()}
            </section>
          )}

          {totals && type === 'ALL' && (
            <section className="card summary" aria-label="Totais do período">
              <div>
                <span className="muted small">Recebido</span>
                <strong className="amount amount--income">{formatMoney(totals.incomePaid)}</strong>
              </div>
              <div>
                <span className="muted small">Pago</span>
                <strong className="amount amount--expense">{formatMoney(totals.expensePaid)}</strong>
              </div>
              <div>
                <span className="muted small">Resultado</span>
                <strong className={`amount ${totals.result < 0 ? 'amount--expense' : ''}`}>{formatMoney(totals.result)}</strong>
              </div>
              {hasPending && (
                <p className="summary__projected small">
                  Com os pendentes ({formatSigned(totals.incomePending, 'INCOME')} / {formatSigned(totals.expensePending, 'EXPENSE')}), o
                  resultado projetado é <strong>{formatMoney(totals.projected)}</strong>.
                </p>
              )}
            </section>
          )}

          <div className="filters">
            <div className="segmented segmented--three" role="radiogroup" aria-label="Filtrar por tipo">
              {(
                [
                  ['ALL', 'Todos'],
                  ['INCOME', 'Receitas'],
                  ['EXPENSE', 'Despesas'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={type === value} className="segmented__option" onClick={() => changeType(value)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="visually-hidden" htmlFor="filter-category">
              Filtrar por categoria
            </label>
            <select
              id="filter-category"
              className="filters__select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            >
              <option value="ALL">Todas as categorias</option>
              {filterOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {type !== 'INCOME' && methods && cards && (
              <>
                <label className="visually-hidden" htmlFor="filter-payment">
                  Filtrar por forma de pagamento
                </label>
                <select id="filter-payment" className="filters__select" value={payment} onChange={(e) => setPayment(e.target.value)}>
                  <option value="ALL">Todas as formas de pagamento</option>
                  {methods.map((method) => (
                    <option key={method.id} value={`m:${method.id}`}>
                      {method.name}
                    </option>
                  ))}
                  {cards.length > 0 && (
                    <optgroup label="Cartões">
                      {cards.map((card) => (
                        <option key={card.id} value={`c:${card.id}`}>
                          {card.name}
                          {card.archived ? ' (arquivado)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </>
            )}
          </div>

        </div>
        <div className="entries__main">
          {(loadError || categoriesError) && <Alert kind="error">{loadError ?? categoriesError}</Alert>}
          {!data && !loadError && (
            <p className="muted" role="status">
              Carregando…
            </p>
          )}

          {data && groups.length === 0 && (
            <div className="empty">
              <p>Nenhum lançamento neste período{type !== 'ALL' || categoryId !== 'ALL' || payment !== 'ALL' ? ' com esses filtros' : ''}.</p>
              <p className="muted small">Toque em “+” para registrar uma receita ou despesa.</p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.date} className="day">
              <h2 className="day__title">{dayHeading(group.date)}</h2>
              <ul className="list">
                {group.entries.map((entry) => {
                  const category = byId.get(entry.categoryId);
                  const label = entry.description || category?.name || 'lançamento';
                  const paidLabel = PAID_LABELS[entry.type].toLowerCase();
                  return (
                    <li key={entry.id} className="entry-row">
                      <CheckButton
                        checked={entry.paid}
                        overdue={entry.overdue}
                        label={`${label}: ${paidLabel}`}
                        doneLabel={paidLabel}
                        onToggle={() => void togglePaid(entry)}
                      />
                      <button type="button" className="list__item entry" onClick={() => setSheet({ kind: 'edit', entry })}>
                        <span
                          className="color-dot"
                          style={{ background: category ? CATEGORY_COLORS[category.color].hex : undefined }}
                          aria-hidden="true"
                        />
                        <span className="entry__text">
                          <span className="list__label">{label}</span>
                          <span className="muted small">
                            {[entry.description ? category?.name : null, paymentLabel(entry, methods ?? [], cards ?? [])]
                              .filter(Boolean)
                              .join(' · ')}
                            {entry.overdue ? (
                              <span className="badge badge--danger">Atrasado</span>
                            ) : (
                              !entry.paid && <span className="badge">Pendente</span>
                            )}
                          </span>
                        </span>
                        <span className={`amount amount--${entry.type === 'INCOME' ? 'income' : 'expense'}`}>
                          {formatSigned(entry.amountCents, entry.type)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

        </div>
      </div>

      <button
        type="button"
        className="fab"
        onClick={() => setSheet({ kind: 'create', type: type === 'INCOME' ? 'INCOME' : 'EXPENSE' })}
        disabled={!categories || !methods || !cards}
      >
        <span aria-hidden="true">+</span>
        <span className="fab__label">Novo lançamento</span>
      </button>

      {sheet && categories && methods && cards && (
        <EntrySheet
          mode={sheet}
          categories={categories}
          methods={methods}
          cards={cards}
          onClose={() => setSheet(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
