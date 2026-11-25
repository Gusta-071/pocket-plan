import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, parseDate, shiftPeriod, today, type Period } from '../../../shared/period';
import type { User } from '../auth/AuthContext';
import { Assistant } from '../components/Assistant';
import { BudgetAmountSheet } from '../components/BudgetAmountSheet';
import { BillRow, InvoiceSheet, toggleBill, type BillItem } from '../components/BillRow';
import { Alert } from '../components/Form';
import { ManageCategoriesLink, ManagePaymentsLink } from '../components/ManageCategoriesLink';
import { PeriodNav } from '../components/PeriodNav';
import { api } from '../lib/api';
import { STATUS_LABELS, type BudgetStatus } from '../lib/budgets';
import { CATEGORY_COLORS, EXPENSE_CLASS_LABELS, type Category, type CategoryColor, type ExpenseClass } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { usePayments } from '../lib/payments';
import { Link, navigate } from '../lib/router';
import { useCategories } from '../lib/useCategories';

type Dashboard = {
  period: Period & { isCurrent: boolean; comparisonDay: number | null };
  previousPeriod: Period;
  totals: {
    incomePaid: number;
    incomePending: number;
    expensePaid: number;
    expensePending: number;
    result: number;
    projected: number;
    /** RN-52a: gastos do mês, pela data da compra. */
    spentCents: number;
    /** RN-52a: o que vence no mês, pela data de pagamento. */
    toPayCents: number;
  };
  balance: { initialCents: number; previousCents: number; currentCents: number; projectedCents: number };
  expenseComparison: { currentCents: number; previousCents: number };
  byClass: {
    expenseClass: ExpenseClass;
    totalCents: number;
    paidCents: number;
    pendingCents: number;
    comparison: { currentCents: number; previousCents: number };
  }[];
  budget: {
    warningPercent: number;
    classes: (Usage & { expenseClass: 'FIXED' | 'VARIABLE' })[];
    categories: (Usage & { categoryId: number; name: string; color: CategoryColor })[];
  };
  goals: {
    savings: Progress | null;
    investment: (Progress & { investedCents: number; pendingCents: number }) | null;
  };
  billsProgress: { paidCount: number; totalCount: number; paidCents: number; pendingCents: number };
  byPaymentMethod: {
    paymentMethodId: number;
    kind: string;
    name: string;
    totalCents: number;
    cards: { cardId: number; name: string; color: CategoryColor; totalCents: number }[];
  }[];
  byCategory: {
    categoryId: number;
    name: string;
    color: CategoryColor;
    totalCents: number;
    pendingCents: number;
    comparison: { currentCents: number; previousCents: number };
  }[];
  evolution: (Period & { incomeCents: number; expenseCents: number })[];
  overdue: { count: number; incomeCents: number; expenseCents: number; entries: BillItem[] };
  upcoming: BillItem[];
};

type Usage = {
  limitCents: number;
  consumedCents: number;
  committedCents: number;
  availableCents: number;
  usedPercent: number;
  status: BudgetStatus;
};

type Progress = { goalCents: number; remainingCents: number; achieved: boolean; projectedAchieved: boolean } & Partial<{
  resultCents: number;
  projectedCents: number;
}>;

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Novembro/2026" → "Novembro" (o ano só aparece quando ajuda). */
const monthName = (label: string) => label.split('/')[0]!;

/** Painel do período (RN-48, RN-49). */
export function HomePage({ user }: { user: User }) {
  const { categories } = useCategories();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRequest = useRef(0);

  const period = shiftPeriod(today(), offset, user.monthStartDay, user.periodNaming);

  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const result = await api<Dashboard>(`/dashboard?date=${period.start}`);
      if (request !== lastRequest.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (request !== lastRequest.current) return;
      setError(err instanceof Error ? err.message : 'Erro ao carregar o painel.');
    }
  }, [period.start]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePaid(item: BillItem) {
    try {
      await toggleBill(item);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o lançamento.');
    }
  }

  const firstName = user.name.split(' ')[0];

  return (
    <div className="home">
      <div className="home__main">
        <div className="home__header">
          <h1 className="dashboard__greeting">Olá, {firstName}!</h1>
          <div className="home__period">
            <PeriodNav period={period} offset={offset} onChange={setOffset} />
          </div>
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        {!data && !error && (
          <p className="muted" role="status">
            Carregando…
          </p>
        )}

        {data && (
          // No PC, os blocos ficam em duas colunas: categorias à esquerda; contas e evolução à direita.
          <div className="dashboard">
            <div className="dashboard__area dashboard__area--summary">
              <Summary data={data} />
              <ClassTotals data={data} />
            </div>
            <div className="dashboard__area dashboard__area--categories">
              <Goals data={data} onChanged={() => void load()} />
              <Budget data={data} />
              <SpendingByCategory data={data} />
              <SpendingByPayment data={data} />
            </div>
            <div className="dashboard__area dashboard__area--side">
              {data.period.isCurrent && (
                <Bills data={data} categories={categories ?? []} onToggle={(item) => void togglePaid(item)} onChanged={() => void load()} />
              )}
              <Evolution data={data} />
            </div>
          </div>
        )}
      </div>
      {/* No PC largo, o assistente fica fixo na coluna da direita; em telas menores, depois do painel. */}
      <aside className="home__side">
        <Assistant onSaved={() => void load()} />
      </aside>
    </div>
  );
}

/** Número principal (resultado do período) e os números de apoio. */
function Summary({ data }: { data: Dashboard }) {
  const { totals, balance, period } = data;
  const hasPending = totals.incomePending + totals.expensePending > 0;
  return (
    <section className="card dashboard__summary" aria-label="Resumo do período">
      <div className="hero">
        <span className="muted small">Resultado de {monthName(period.label)}</span>
        <strong className={`hero__value ${totals.result < 0 ? 'amount--expense' : ''}`}>{formatMoney(totals.result)}</strong>
        {hasPending && (
          <span className="muted small">
            Com os pendentes, fecha em <strong className={totals.projected < 0 ? 'amount--expense' : ''}>{formatMoney(totals.projected)}</strong>
          </span>
        )}
      </div>
      <dl className="stats">
        <div className="stat">
          <dt>Saldo acumulado</dt>
          <dd className={balance.currentCents < 0 ? 'amount--expense' : ''}>{formatMoney(balance.currentCents)}</dd>
          <dd className="stat__sub">Veio de antes: {formatMoney(balance.previousCents)}</dd>
        </div>
        <div className="stat">
          <dt>Recebido</dt>
          <dd>{formatMoney(totals.incomePaid)}</dd>
          {totals.incomePending > 0 && <dd className="stat__sub">A receber: {formatMoney(totals.incomePending)}</dd>}
        </div>
        {/* RN-52a: o que foi gasto no mês (data da compra) e o que vence no mês (data de pagamento). */}
        <div className="stat">
          <dt>Gastos do mês</dt>
          <dd>{formatMoney(totals.spentCents)}</dd>
          <dd className="stat__sub">Pela data da compra</dd>
        </div>
        <div className="stat">
          <dt>A pagar no mês</dt>
          <dd>{formatMoney(totals.toPayCents)}</dd>
          <dd className="stat__sub">
            {totals.expensePending > 0 ? `Falta pagar ${formatMoney(totals.expensePending)}` : 'Tudo pago'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Gastos fixos, variáveis e investido no período (RN-14a, RN-28, RN-48), com a comparação (RN-49).
 * O investido aparece à parte: entra no resultado, mas não é gasto do dia a dia.
 */
function ClassTotals({ data }: { data: Dashboard }) {
  const previousName = monthName(data.previousPeriod.label);
  return (
    <section className="card class-totals" aria-label="Gastos por classe">
      {data.byClass.map((c) => (
        <div key={c.expenseClass} className={`class-total class-total--${c.expenseClass.toLowerCase()}`}>
          <span className="class-total__name">
            {c.expenseClass === 'INVESTMENT' ? 'Investido' : `Gastos ${EXPENSE_CLASS_LABELS[c.expenseClass].plural.toLowerCase()}`}
          </span>
          <strong className="class-total__value">{formatMoney(c.totalCents)}</strong>
          <span className="class-total__sub small muted">
            {c.pendingCents > 0 ? `${formatMoney(c.pendingCents)} pendente` : 'Tudo acertado'}
          </span>
          <span className="class-total__sub small muted">
            vs. {previousName}: <Delta current={c.comparison.currentCents} previous={c.comparison.previousCents} invert={c.expenseClass === 'INVESTMENT'} />
          </span>
        </div>
      ))}
    </section>
  );
}

/** Metas de economia e de investimento (RN-29b, RN-33, RN-34), editadas aqui mesmo (RN-47a). */
function Goals({ data, onChanged }: { data: Dashboard; onChanged: () => void }) {
  const [editing, setEditing] = useState<'SAVINGS_GOAL' | 'INVESTMENT_GOAL' | null>(null);
  const { savings, investment } = data.goals;
  const isCurrent = data.period.isCurrent;

  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2>Metas</h2>
        {!isCurrent && <span className="small muted">Edição só no período atual</span>}
      </div>
      <div className="goals">
        <GoalCard
          target="meta-SAVINGS"
          title="Economia"
          empty="Quanto você quer que sobre no fim do mês?"
          canEdit={isCurrent}
          onEdit={() => setEditing('SAVINGS_GOAL')}
          goal={
            savings && {
              goalCents: savings.goalCents,
              valueCents: savings.resultCents ?? 0,
              achieved: savings.achieved,
              detail: savings.achieved
                ? 'Meta atingida com o resultado do mês.'
                : savings.projectedAchieved
                  ? `Com os pendentes, o mês fecha em ${formatMoney(savings.projectedCents ?? 0)} e atinge a meta.`
                  : `Faltam ${formatMoney(savings.remainingCents)}. Com os pendentes, fecha em ${formatMoney(savings.projectedCents ?? 0)}.`,
            }
          }
        />
        <GoalCard
          target="meta-INVESTMENT"
          title="Investimento"
          empty="Quanto você quer investir por mês?"
          canEdit={isCurrent}
          onEdit={() => setEditing('INVESTMENT_GOAL')}
          goal={
            investment && {
              goalCents: investment.goalCents,
              valueCents: investment.investedCents,
              achieved: investment.achieved,
              detail: investment.achieved
                ? 'Meta atingida.'
                : `Faltam ${formatMoney(investment.remainingCents)}${investment.pendingCents > 0 ? ` (${formatMoney(investment.pendingCents)} em aportes pendentes)` : ''}.`,
            }
          }
        />
      </div>
      {editing && (
        <BudgetAmountSheet
          title={editing === 'SAVINGS_GOAL' ? 'Meta de economia' : 'Meta de investimento'}
          label={editing === 'SAVINGS_GOAL' ? 'Economizar por mês' : 'Investir por mês'}
          description={
            editing === 'SAVINGS_GOAL'
              ? 'A meta é atingida quando o resultado do mês (recebido − pago) chega a este valor.'
              : 'A meta é atingida quando os aportes pagos em categorias de investimento chegam a este valor.'
          }
          target={{ kind: editing }}
          currentCents={(editing === 'SAVINGS_GOAL' ? savings : investment)?.goalCents ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function GoalCard({
  target,
  title,
  empty,
  goal,
  canEdit,
  onEdit,
}: {
  target: string;
  title: string;
  empty: string;
  goal: { goalCents: number; valueCents: number; achieved: boolean; detail: string } | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const percent = goal ? Math.max(0, Math.min(100, Math.round((goal.valueCents / goal.goalCents) * 100))) : 0;
  return (
    <div className="card goal" data-destaque={target}>
      <div className="goal__header">
        <span className="goal__title">{title}</span>
        {canEdit && (
          <button type="button" className="link-button small" onClick={onEdit}>
            {goal ? 'Editar' : 'Definir meta'}
          </button>
        )}
      </div>
      {goal ? (
        <>
          <span className="goal__value">
            <strong className={goal.valueCents < 0 ? 'amount--expense' : ''}>{formatMoney(goal.valueCents)}</strong>
            <span className="muted small"> de {formatMoney(goal.goalCents)}</span>
          </span>
          <span className="meter" role="img" aria-label={`${percent}% da meta`}>
            <span className={`meter__fill ${goal.achieved ? 'meter__fill--done' : ''}`} style={{ width: `${percent}%` }} />
          </span>
          <span className="small muted">
            {goal.achieved && <span className="badge badge--success">Atingida</span>} {goal.detail}
          </span>
        </>
      ) : (
        <span className="small muted">{empty}</span>
      )}
    </div>
  );
}

/** Limites por classe e por categoria (RN-29 a RN-32): consumido, comprometido, disponível e alerta. */
function Budget({ data }: { data: Dashboard }) {
  const { classes, categories, warningPercent } = data.budget;
  const rows = [
    ...classes.map((c) => ({ key: `class-${c.expenseClass}`, target: `orcamento-classe-${c.expenseClass}`, name: `Despesas ${c.expenseClass === 'FIXED' ? 'fixas' : 'variáveis'}`, color: null, isClass: true, ...c })),
    ...categories.map((c) => ({ ...c, key: `category-${c.categoryId}`, target: `orcamento-categoria-${c.categoryId}`, isClass: false })),
  ];

  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2 className="section-header__title">
          Orçamento <ManageCategoriesLink />
        </h2>
        <span className="small muted">Atenção a partir de {warningPercent}%</span>
      </div>
      {rows.length === 0 ? (
        <p className="card muted small dashboard__empty">
          Nenhum limite definido. Defina limites por categoria ou por classe em Ajustes → Categorias.
        </p>
      ) : (
        <div className="card">
          <ul className="budget">
            {rows.map((row) => {
              const consumed = Math.min(100, (row.consumedCents / row.limitCents) * 100);
              const committed = Math.min(100 - consumed, (row.committedCents / row.limitCents) * 100);
              return (
                <li key={row.key} className={`budget__row budget__row--${row.status.toLowerCase()}`} data-destaque={row.target}>
                  <span className={`budget__name ${row.isClass ? 'budget__name--class' : ''}`}>
                    {row.color && <span className="color-dot" style={{ background: CATEGORY_COLORS[row.color].hex }} aria-hidden="true" />}
                    {row.name}
                    {row.status !== 'OK' && (
                      <span className={`badge ${row.status === 'EXCEEDED' ? 'badge--danger' : 'badge--warning'}`}>{STATUS_LABELS[row.status]}</span>
                    )}
                  </span>
                  <span className="budget__value small">
                    {row.usedPercent}% de {formatMoney(row.limitCents)}
                  </span>
                  <span className="budget__track" aria-hidden="true">
                    <span className="budget__consumed" style={{ width: `${consumed}%` }} />
                    <span className="budget__committed" style={{ width: `${committed}%` }} />
                    <span className="budget__marker" style={{ left: `${warningPercent}%` }} />
                  </span>
                  <span className="budget__detail small muted">
                    Pago {formatMoney(row.consumedCents)}
                    {row.committedCents > 0 && ` · pendente ${formatMoney(row.committedCents)}`} ·{' '}
                    {row.availableCents >= 0 ? (
                      `disponível ${formatMoney(row.availableCents)}`
                    ) : (
                      <span className="amount--expense">passou {formatMoney(-row.availableCents)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Atrasadas de qualquer período e pendentes dos próximos 7 dias, com o check (RN-22b). */
function Bills({
  data,
  categories,
  onToggle,
  onChanged,
}: {
  data: Dashboard;
  categories: Category[];
  onToggle: (item: BillItem) => void;
  onChanged: () => void;
}) {
  const items = [...data.overdue.entries, ...data.upcoming];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const { methods, cards } = usePayments();
  const [openInvoice, setOpenInvoice] = useState<BillItem | null>(null);
  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2>Contas a acertar</h2>
        <Link href="/contas" className="small">
          Ver todas as contas do mês
        </Link>
      </div>
      {/* RN-50a: o mesmo progresso das Contas do mês. */}
      {data.billsProgress.totalCount > 0 && (
        <p className="small muted bills-mini">
          <strong>
            {data.billsProgress.paidCount} de {data.billsProgress.totalCount}
          </strong>{' '}
          contas do mês pagas
          {data.billsProgress.pendingCents > 0 && ` · falta pagar ${formatMoney(data.billsProgress.pendingCents)}`}
          <span className="meter" aria-hidden="true">
            <span
              className="meter__fill"
              style={{ width: `${Math.round((data.billsProgress.paidCount / data.billsProgress.totalCount) * 100)}%` }}
            />
          </span>
        </p>
      )}
      {items.length === 0 ? (
        <p className="card muted small dashboard__empty">Nada atrasado nem vencendo nos próximos 7 dias. 🎉</p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <BillRow
              key={item.id}
              item={item}
              categories={byId}
              methods={methods ?? []}
              cards={cards ?? []}
              dueOnly
              onToggle={() => onToggle(item)}
              onOpen={() => (item.invoice ? setOpenInvoice(item) : navigate('/contas'))}
            />
          ))}
        </ul>
      )}
      {openInvoice && cards && (
        <InvoiceSheet
          item={openInvoice}
          categories={byId}
          cards={cards}
          onClose={() => setOpenInvoice(null)}
          onChanged={() => {
            setOpenInvoice(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/**
 * Variação em relação ao período anterior (RN-49). Gastar mais é ruim: sobe em vermelho, desce em verde.
 * Com `invert` (investimentos), subir é bom e fica verde.
 */
function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) return current > 0 ? <span className="delta">novo</span> : null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.01) return <span className="delta">= igual</span>;
  const up = change > 0;
  const pct = Math.round(Math.abs(change) * 100);
  const bad = invert ? !up : up;
  return (
    <span className={`delta ${bad ? 'delta--up' : 'delta--down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="visually-hidden">{up ? 'mais' : 'menos'}</span> {pct}%
    </span>
  );
}

/** Gastos por categoria, do maior para o menor, com a comparação com o período anterior (RN-48, RN-49). */
function SpendingByCategory({ data }: { data: Dashboard }) {
  const { byCategory, expenseComparison, period, previousPeriod } = data;
  const max = Math.max(...byCategory.map((c) => c.totalCents), 1);
  const previousName = monthName(previousPeriod.label);
  const basis =
    period.comparisonDay === null
      ? `Comparado com ${previousName} inteiro.`
      : `Comparado com ${previousName} até o mesmo dia (${period.comparisonDay + 1}º dia do período).`;

  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2 className="section-header__title">
          Gastos por categoria <ManageCategoriesLink />
        </h2>
        <span className="small muted">
          Total vs. {previousName}: <Delta current={expenseComparison.currentCents} previous={expenseComparison.previousCents} />
        </span>
      </div>
      {byCategory.length === 0 ? (
        <p className="card muted small dashboard__empty">Nenhuma despesa neste período.</p>
      ) : (
        <div className="card">
          <ul className="bars">
            {byCategory.map((c) => (
              <li key={c.categoryId} className="bars__row">
                <span className="bars__name">
                  <span className="color-dot" style={{ background: CATEGORY_COLORS[c.color].hex }} aria-hidden="true" />
                  {c.name}
                </span>
                <span className="bars__value">
                  {formatMoney(c.totalCents)} <Delta current={c.comparison.currentCents} previous={c.comparison.previousCents} />
                </span>
                <span className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={{ width: `${(c.totalCents / max) * 100}%` }} />
                </span>
                {c.pendingCents > 0 && <span className="bars__note small muted">{formatMoney(c.pendingCents)} ainda pendente</span>}
              </li>
            ))}
          </ul>
          <p className="small muted bars__footnote">{basis} Inclui o que já foi pago e o que está pendente.</p>
        </div>
      )}
    </section>
  );
}

/** RN-71: quanto saiu por cada forma de pagamento; no crédito, separado por cartão. */
function SpendingByPayment({ data }: { data: Dashboard }) {
  const rows = data.byPaymentMethod;
  const max = Math.max(...rows.map((r) => r.totalCents), 1);
  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2 className="section-header__title">
          Gastos por forma de pagamento <ManagePaymentsLink />
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="card muted small dashboard__empty">Nenhuma despesa neste período.</p>
      ) : (
        <div className="card">
          <ul className="bars">
            {rows.map((row) => (
              <li key={row.paymentMethodId} className="bars__row">
                <span className="bars__name">{row.name}</span>
                <span className="bars__value">{formatMoney(row.totalCents)}</span>
                <span className="bars__track" aria-hidden="true">
                  <span className="bars__fill" style={{ width: `${(row.totalCents / max) * 100}%` }} />
                </span>
                {row.cards.length > 0 && (
                  <span className="bars__note small muted">
                    {row.cards.map((card, i) => (
                      <span key={card.cardId}>
                        {i > 0 && ' · '}
                        <span className="color-dot color-dot--small" style={{ background: CATEGORY_COLORS[card.color].hex }} aria-hidden="true" />{' '}
                        {card.name}: {formatMoney(card.totalCents)}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Escala "redonda" para o eixo: 4 divisões de 1, 2, 2,5 ou 5 × 10ⁿ. */
function niceScale(maxCents: number): number[] {
  const max = Math.max(maxCents, 100_00);
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** R$ 12.000,00 → "12 mil" (eixo do gráfico). */
function compactMoney(cents: number): string {
  const reais = cents / 100;
  if (reais === 0) return '0';
  if (reais >= 1000) return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return reais.toLocaleString('pt-BR');
}

/** Receitas × despesas dos últimos 6 períodos: colunas agrupadas, com dica ao passar o mouse ou focar. */
function Evolution({ data }: { data: Dashboard }) {
  const [active, setActive] = useState<number | null>(null);
  const { evolution } = data;
  const ticks = niceScale(Math.max(...evolution.flatMap((p) => [p.incomeCents, p.expenseCents])));
  const top = ticks.at(-1)!;
  const height = (cents: number) => `${(cents / top) * 100}%`;
  const shortLabel = (p: Period) => {
    const [name, year] = p.label.split('/');
    const index = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].indexOf(name!);
    return `${MONTHS_SHORT[index]}${index === 0 ? `/${year!.slice(2)}` : ''}`;
  };
  const shown = active === null ? null : evolution[active]!;

  return (
    <section className="dashboard__section">
      <div className="section-header">
        <h2>Receitas e despesas</h2>
        <span className="legend small">
          <span className="legend__item">
            <span className="legend__swatch legend__swatch--income" aria-hidden="true" /> Receitas
          </span>
          <span className="legend__item">
            <span className="legend__swatch legend__swatch--expense" aria-hidden="true" /> Despesas
          </span>
        </span>
      </div>
      <div className="card evo">
        <div className="evo__plot" onMouseLeave={() => setActive(null)}>
          {ticks.map((tick) => (
            <div key={tick} className="evo__grid" style={{ bottom: height(tick) }}>
              <span>{compactMoney(tick)}</span>
            </div>
          ))}
          <div className="evo__groups">
            {evolution.map((p, i) => (
              <button
                key={p.start}
                type="button"
                className={`evo__group ${active === i ? 'evo__group--active' : ''}`}
                aria-label={`${p.label}: receitas ${formatMoney(p.incomeCents)}, despesas ${formatMoney(p.expenseCents)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span className="evo__bar evo__bar--income" style={{ height: height(p.incomeCents) }} />
                <span className="evo__bar evo__bar--expense" style={{ height: height(p.expenseCents) }} />
              </button>
            ))}
          </div>
          {shown && (
            <div
              className="evo__tooltip"
              // A dica fica ao lado do grupo (à direita na primeira metade, à esquerda na segunda), sem cobrir as barras.
              style={
                active! < evolution.length / 2
                  ? { left: `calc(${((active! + 1) / evolution.length) * 100}% + 4px)` }
                  : { left: `calc(${(active! / evolution.length) * 100}% - 4px)`, transform: 'translateX(-100%)' }
              }
              role="status"
            >
              <strong>{shown.label}</strong>
              <span>
                <span className="legend__swatch legend__swatch--income" aria-hidden="true" /> Receitas {formatMoney(shown.incomeCents)}
              </span>
              <span>
                <span className="legend__swatch legend__swatch--expense" aria-hidden="true" /> Despesas {formatMoney(shown.expenseCents)}
              </span>
              <span className="muted">Saldo {formatMoney(shown.incomeCents - shown.expenseCents)}</span>
            </div>
          )}
        </div>
        <div className="evo__labels" aria-hidden="true">
          {evolution.map((p) => (
            <span key={p.start} className={p.start === data.period.start ? 'evo__label--current' : undefined}>
              {shortLabel(p)}
            </span>
          ))}
        </div>
        <table className="visually-hidden">
          <caption>Receitas e despesas por período</caption>
          <thead>
            <tr>
              <th scope="col">Período</th>
              <th scope="col">Receitas</th>
              <th scope="col">Despesas</th>
            </tr>
          </thead>
          <tbody>
            {evolution.map((p) => (
              <tr key={p.start}>
                <th scope="row">
                  {p.label} ({formatDate(p.start)} a {formatDate(p.end)})
                </th>
                <td>{formatMoney(p.incomeCents)}</td>
                <td>{formatMoney(p.expenseCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted bars__footnote">Considera pagos e pendentes, pela data dos lançamentos.</p>
      </div>
    </section>
  );
}
