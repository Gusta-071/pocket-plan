import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, formatDate, parseDate, periodContaining, shiftPeriod, today } from '../../../shared/period';
import type { User } from '../auth/AuthContext';
import { EntrySheet, type Entry, type EntrySheetMode } from '../components/EntrySheet';
import { Alert } from '../components/Form';
import { api } from '../lib/api';
import { CATEGORY_COLORS, type Category, type CategoryType } from '../lib/categories';
import { formatMoney, formatSigned } from '../lib/money';
import { useCategories } from '../lib/useCategories';

type Totals = {
  incomeRealized: number;
  incomePlanned: number;
  expenseRealized: number;
  expensePlanned: number;
  result: number;
  projected: number;
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

  const totals = data?.totals;
  const hasPlanned = totals ? totals.incomePlanned + totals.expensePlanned > 0 : false;

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
        // Filtrando um tipo só, "resultado" não faz sentido: mostra o realizado, o previsto e o total desse tipo.
        <section className="card summary" aria-label="Totais do período">
          {(() => {
            const kind = type === 'INCOME' ? 'income' : 'expense';
            const realized = type === 'INCOME' ? totals.incomeRealized : totals.expenseRealized;
            const planned = type === 'INCOME' ? totals.incomePlanned : totals.expensePlanned;
            return (
              <>
                <div>
                  <span className="muted small">{type === 'INCOME' ? 'Recebido' : 'Gasto'}</span>
                  <strong className={`amount amount--${kind}`}>{formatMoney(realized)}</strong>
                </div>
                <div>
                  <span className="muted small">{type === 'INCOME' ? 'A receber' : 'A pagar'}</span>
                  <strong className="amount">{formatMoney(planned)}</strong>
                </div>
                <div>
                  <span className="muted small">Total</span>
                  <strong className={`amount amount--${kind}`}>{formatMoney(realized + planned)}</strong>
                </div>
              </>
            );
          })()}
        </section>
      )}

      {totals && type === 'ALL' && (
        <section className="card summary" aria-label="Totais do período">
          <div>
            <span className="muted small">Receitas</span>
            <strong className="amount amount--income">{formatMoney(totals.incomeRealized)}</strong>
          </div>
          <div>
            <span className="muted small">Despesas</span>
            <strong className="amount amount--expense">{formatMoney(totals.expenseRealized)}</strong>
          </div>
          <div>
            <span className="muted small">Resultado</span>
            <strong className={`amount ${totals.result < 0 ? 'amount--expense' : ''}`}>{formatMoney(totals.result)}</strong>
          </div>
          {hasPlanned && (
            <p className="summary__projected small">
              Com os previstos ({formatSigned(totals.incomePlanned, 'INCOME')} / {formatSigned(totals.expensePlanned, 'EXPENSE')}), o
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
              return (
                <li key={entry.id}>
                  <button type="button" className="list__item entry" onClick={() => setSheet({ kind: 'edit', entry })}>
                    <span
                      className="color-dot"
                      style={{ background: category ? CATEGORY_COLORS[category.color].hex : undefined }}
                      aria-hidden="true"
                    />
                    <span className="entry__text">
                      <span className="list__label">{entry.description || category?.name}</span>
                      <span className="muted small">
                        {entry.description ? category?.name : null}
                        {entry.status === 'PLANNED' && <span className="badge">Previsto</span>}
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
