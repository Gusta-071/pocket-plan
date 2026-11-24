import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, formatDate, parseDate, periodContaining, shiftPeriod, today } from '../../../shared/period';
import type { User } from '../auth/AuthContext';
import { EntrySheet, PAID_LABELS, type Entry, type EntrySheetMode } from '../components/EntrySheet';
import { Alert } from '../components/Form';
import { api } from '../lib/api';
import { CATEGORY_COLORS, type Category, type CategoryType } from '../lib/categories';
import { formatMoney, formatSigned } from '../lib/money';
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
    try {
      const result = await api<{ entries: Entry[]; totals: Totals }>(`/entries?${params}`);
      if (request !== lastRequest.current) return;
      setData(result);
      setLoadError(null);
    } catch (err) {
      if (request !== lastRequest.current) return;
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os lançamentos.');
    }
  }, [period.start, period.end, type, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map<number, Category>((categories ?? []).map((c) => [c.id, c]));
  const filterOptions = (categories ?? []).filter((c) => type === 'ALL' || c.type === type);

  function changeType(next: CategoryType | 'ALL') {
    setType(next);
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
      <div className="page-header">
        <h1>Lançamentos</h1>
      </div>

      <nav className="period-nav" aria-label="Período">
        <button type="button" className="period-nav__arrow" aria-label="Período anterior" onClick={() => setOffset((o) => o - 1)}>
          ‹
        </button>
        <div className="period-nav__label">
          <strong>{period.label}</strong>
          <span className="muted small">
            {formatDate(period.start)} a {formatDate(period.end)}
          </span>
        </div>
        <button type="button" className="period-nav__arrow" aria-label="Próximo período" onClick={() => setOffset((o) => o + 1)}>
          ›
        </button>
      </nav>
      {offset !== 0 && (
        <button type="button" className="link-button period-nav__today" onClick={() => setOffset(0)}>
          Voltar ao período atual
        </button>
      )}

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
      </div>

      {(loadError || categoriesError) && <Alert kind="error">{loadError ?? categoriesError}</Alert>}
      {!data && !loadError && (
        <p className="muted" role="status">
          Carregando…
        </p>
      )}

      {data && groups.length === 0 && (
        <div className="empty">
          <p>Nenhum lançamento neste período{type !== 'ALL' || categoryId !== 'ALL' ? ' com esses filtros' : ''}.</p>
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
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={entry.paid}
                    aria-label={`${label}: ${paidLabel}`}
                    title={entry.paid ? `Marcar como pendente` : `Marcar como ${paidLabel}`}
                    className={`check ${entry.paid ? 'check--on' : ''} ${entry.overdue ? 'check--overdue' : ''}`}
                    onClick={() => void togglePaid(entry)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                  <button type="button" className="list__item entry" onClick={() => setSheet({ kind: 'edit', entry })}>
                    <span
                      className="color-dot"
                      style={{ background: category ? CATEGORY_COLORS[category.color].hex : undefined }}
                      aria-hidden="true"
                    />
                    <span className="entry__text">
                      <span className="list__label">{label}</span>
                      <span className="muted small">
                        {entry.description ? category?.name : null}
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

      <button
        type="button"
        className="fab"
        onClick={() => setSheet({ kind: 'create', type: type === 'INCOME' ? 'INCOME' : 'EXPENSE' })}
        disabled={!categories}
      >
        <span aria-hidden="true">+</span>
        <span className="fab__label">Novo lançamento</span>
      </button>

      {sheet && categories && (
        <EntrySheet mode={sheet} categories={categories} onClose={() => setSheet(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
