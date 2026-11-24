/**
 * Regras das Contas do mês (RN-50 a RN-50d) como funções puras: recebem os lançamentos já buscados
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

/** Lançamento como as Contas o recebem: com a data de pagamento (RN-52a) e o cartão. */
export type PayableEntry = BillEntry & { payDate: string; cardId: number | null; overdue: boolean };

/** Uma conta: um lançamento à vista, ou uma fatura inteira de cartão (RN-50d). */
export type BillItem<T extends PayableEntry> =
  | (T & { invoice: null })
  | (BillEntry & { overdue: boolean; payDate: string; cardId: number; invoice: { cardId: number; due: string; count: number; entries: T[] } });

/**
 * RN-50d, RN-54: agrupa as compras no cartão em faturas (cartão + vencimento). A fatura está paga
 * quando todas as compras dela estão; vale a data de pagamento (o vencimento) para ordenar.
 * Os demais lançamentos passam como estão, com a data de pagamento como data da conta.
 */
export function groupInvoices<T extends PayableEntry>(entries: T[]): BillItem<T>[] {
  const items: BillItem<T>[] = [];
  const invoices = new Map<string, T[]>();
  for (const entry of entries) {
    if (entry.cardId === null) {
      items.push({ ...entry, date: entry.payDate, invoice: null });
      continue;
    }
    const key = `${entry.cardId}|${entry.payDate}`;
    invoices.set(key, [...(invoices.get(key) ?? []), entry]);
  }
  for (const group of invoices.values()) {
    const first = group[0]!;
    const paid = group.every((e) => e.paid);
    items.push({
      // Id negativo e estável: não colide com lançamentos e não muda entre buscas.
      id: -Math.min(...group.map((e) => e.id)),
      type: 'EXPENSE',
      amountCents: total(group),
      date: first.payDate,
      payDate: first.payDate,
      paid,
      overdue: group.some((e) => e.overdue),
      cardId: first.cardId!,
      invoice: { cardId: first.cardId!, due: first.payDate, count: group.length, entries: [...group].sort(byDate) },
    });
  }
  return items;
}

/**
 * Organiza as contas de um período.
 * - `entries`: contas do período (despesas e receitas), já com as faturas agrupadas.
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
    // RN-50a: o progresso conta só as despesas do período (cada fatura conta como uma conta).
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
