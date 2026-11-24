/**
 * Regras das Contas do mês (RN-50 a RN-50c) como funções puras: recebem os lançamentos já buscados
 * e devolvem a lista organizada, sem banco nem relógio ("Functional Core, Imperative Shell").
 */

export type BillEntry = {
  id: number;
  type: string;
  amountCents: number;
  date: string;
  paid: boolean;
};

const byDate = <T extends BillEntry>(a: T, b: T) => a.date.localeCompare(b.date) || a.id - b.id;
const total = (entries: BillEntry[]) => entries.reduce((sum, e) => sum + e.amountCents, 0);

/**
 * Organiza as contas de um período.
 * - `entries`: lançamentos do período (despesas e receitas).
 * - `earlierPending`: pendentes de períodos anteriores; só entram no aviso quando o período é o atual (RN-50c).
 */
export function buildChecklist<T extends BillEntry>(entries: T[], earlierPending: T[], isCurrent: boolean) {
  const expenses = entries.filter((e) => e.type === 'EXPENSE');
  // RN-50: pendentes primeiro (as atrasadas são as de data mais antiga, então já vêm antes), depois as pagas.
  const pending = expenses.filter((e) => !e.paid).sort(byDate);
  const paid = expenses.filter((e) => e.paid).sort(byDate);

  // RN-50b: receitas ainda não recebidas, numa seção à parte.
  const receivables = entries.filter((e) => e.type === 'INCOME' && !e.paid).sort(byDate);

  // RN-50c: atrasadas de meses anteriores, num aviso, só no período atual.
  const previous = isCurrent ? [...earlierPending].sort(byDate) : [];

  return {
    // RN-50a: o progresso conta só as despesas do período.
    progress: {
      paidCount: paid.length,
      totalCount: expenses.length,
      paidCents: total(paid),
      pendingCents: total(pending),
    },
    expenses: [...pending, ...paid],
    receivables: { entries: receivables, totalCents: total(receivables) },
    previousOverdue: {
      entries: previous,
      expenseCents: total(previous.filter((e) => e.type === 'EXPENSE')),
      incomeCents: total(previous.filter((e) => e.type === 'INCOME')),
    },
  };
}
