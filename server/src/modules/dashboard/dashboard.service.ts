import { addDays, daysBetween, periodContaining, shiftPeriod, today, type PeriodNaming } from '../../../../shared/period.js';
import { prisma } from '../../lib/prisma.js';

/** Quantos períodos aparecem no gráfico de evolução, contando o escolhido. */
export const HISTORY_LENGTH = 6;
/** Contas pendentes que vencem nos próximos dias aparecem em "Próximas contas". */
export const UPCOMING_DAYS = 7;

type Row = { id: number; type: string; amountCents: number; date: string; categoryId: number; description: string | null; paid: boolean };

const sum = (rows: Row[], filter: (row: Row) => boolean) => rows.reduce((total, row) => (filter(row) ? total + row.amountCents : total), 0);

/**
 * Painel do período (RN-48, RN-49) que contém `date`.
 * Tudo é calculado a partir dos lançamentos, como os demais totais (RN-13).
 */
export async function getDashboard(userId: number, date: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const naming = user.periodNaming as PeriodNaming;
  const todayValue = today();
  const period = periodContaining(date, user.monthStartDay, naming);
  const previous = shiftPeriod(date, -1, user.monthStartDay, naming);
  const history = Array.from({ length: HISTORY_LENGTH }, (_, i) =>
    shiftPeriod(date, i - (HISTORY_LENGTH - 1), user.monthStartDay, naming),
  );

  // Uma busca para o período, o anterior e o histórico; o saldo acumulado usa somas no banco.
  const rows: Row[] = await prisma.entry.findMany({
    where: { userId, date: { gte: history[0]!.start, lte: period.end } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const inPeriod = rows.filter((r) => r.date >= period.start && r.date <= period.end);
  const isIncome = (r: Row) => r.type === 'INCOME';
  const isExpense = (r: Row) => r.type === 'EXPENSE';

  // RN-26, RN-27
  const totals = {
    incomePaid: sum(inPeriod, (r) => isIncome(r) && r.paid),
    incomePending: sum(inPeriod, (r) => isIncome(r) && !r.paid),
    expensePaid: sum(inPeriod, (r) => isExpense(r) && r.paid),
    expensePending: sum(inPeriod, (r) => isExpense(r) && !r.paid),
  };
  const result = totals.incomePaid - totals.expensePaid;
  const projected = result + totals.incomePending - totals.expensePending;

  // RN-28a: saldo inicial + tudo o que foi pago/recebido até o fim do período.
  const paidUntil = async (type: string, paid: boolean, lte: string) =>
    (await prisma.entry.aggregate({ where: { userId, type, paid, date: { lte } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  const [incomeBefore, expenseBefore, incomePendingUntilEnd, expensePendingUntilEnd] = await Promise.all([
    paidUntil('INCOME', true, addDays(period.start, -1)),
    paidUntil('EXPENSE', true, addDays(period.start, -1)),
    paidUntil('INCOME', false, period.end),
    paidUntil('EXPENSE', false, period.end),
  ]);
  const previousBalance = user.initialBalanceCents + incomeBefore - expenseBefore;
  const balance = previousBalance + result;
  // Inclui os atrasados de períodos anteriores, que ainda vão sair ou entrar.
  const projectedBalance = balance + incomePendingUntilEnd - expensePendingUntilEnd;

  // RN-49: no período atual, compara com o anterior até o mesmo dia; encerrados, inteiros.
  const isCurrent = todayValue >= period.start && todayValue <= period.end;
  const comparisonDay = isCurrent ? daysBetween(period.start, todayValue) : null;
  const currentLimit = isCurrent ? todayValue : period.end;
  const sameDay = comparisonDay === null ? previous.end : addDays(previous.start, comparisonDay);
  // O período anterior pode ser mais curto (ex.: fevereiro): não passa do fim dele.
  const previousLimit = sameDay < previous.end ? sameDay : previous.end;

  const categories = await prisma.category.findMany({ where: { userId, type: 'EXPENSE' } });
  const byCategory = categories
    .map((category) => {
      const ofCategory = (r: Row) => isExpense(r) && r.categoryId === category.id;
      return {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        // O gasto do período considera pagos e pendentes: mede quanto se gastou (RN-49).
        totalCents: sum(inPeriod, ofCategory),
        pendingCents: sum(inPeriod, (r) => ofCategory(r) && !r.paid),
        comparison: {
          currentCents: sum(inPeriod, (r) => ofCategory(r) && r.date <= currentLimit),
          previousCents: sum(rows, (r) => ofCategory(r) && r.date >= previous.start && r.date <= previousLimit),
        },
      };
    })
    .filter((c) => c.totalCents > 0 || c.comparison.previousCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'));

  const expenseComparison = {
    currentCents: sum(inPeriod, (r) => isExpense(r) && r.date <= currentLimit),
    previousCents: sum(rows, (r) => isExpense(r) && r.date >= previous.start && r.date <= previousLimit),
  };

  // Evolução: receitas e despesas de cada período, pagas ou pendentes.
  const evolution = history.map((p) => {
    const of = rows.filter((r) => r.date >= p.start && r.date <= p.end);
    return { ...p, incomeCents: sum(of, isIncome), expenseCents: sum(of, isExpense) };
  });

  // Contas atrasadas (de qualquer período) e as pendentes dos próximos dias (RN-22a, RN-50).
  const [overdueRows, upcomingRows] = await Promise.all([
    prisma.entry.findMany({ where: { userId, paid: false, date: { lt: todayValue } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
    prisma.entry.findMany({
      where: { userId, paid: false, date: { gte: todayValue, lte: addDays(todayValue, UPCOMING_DAYS) } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const publicEntry = (r: Row) => ({
    id: r.id,
    type: r.type,
    amountCents: r.amountCents,
    date: r.date,
    categoryId: r.categoryId,
    description: r.description,
    paid: r.paid,
    overdue: !r.paid && r.date < todayValue,
  });

  return {
    period: { ...period, isCurrent, comparisonDay },
    previousPeriod: previous,
    totals: { ...totals, result, projected },
    balance: { initialCents: user.initialBalanceCents, previousCents: previousBalance, currentCents: balance, projectedCents: projectedBalance },
    expenseComparison,
    byCategory,
    evolution,
    overdue: {
      count: overdueRows.length,
      incomeCents: sum(overdueRows, isIncome),
      expenseCents: sum(overdueRows, isExpense),
      entries: overdueRows.map(publicEntry),
    },
    upcoming: upcomingRows.map(publicEntry),
  };
}
