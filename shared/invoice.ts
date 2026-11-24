import { addMonths, lastDayOfMonth, parseDate, toDateString } from './period.js';

/**
 * Regras de fatura e parcelamento (RN-53 a RN-56) como funções puras: recebem datas e valores
 * e devolvem datas e valores, sem banco nem relógio ("Functional Core, Imperative Shell").
 */

/** Dia `day` do mês, ou o último dia se o mês for mais curto (RN-51). */
function dayInMonth(year: number, month: number, day: number): string {
  const normalized = parseDate(toDateString(year, month, 1));
  return toDateString(normalized.year, normalized.month, Math.min(day, lastDayOfMonth(normalized.year, normalized.month)));
}

export type Invoice = { closing: string; due: string };

/**
 * RN-53: fatura em que entra uma compra feita em `date`.
 * Até o dia do fechamento (inclusive), entra na fatura que fecha naquele mês; depois, na seguinte.
 * O vencimento é no mesmo mês do fechamento se o dia de vencimento vier depois do de fechamento; senão, no mês seguinte.
 */
export function invoiceFor(date: string, closingDay: number, dueDay: number): Invoice {
  const { year, month } = parseDate(date);
  const closingThisMonth = dayInMonth(year, month, closingDay);
  const closing = date <= closingThisMonth ? closingThisMonth : dayInMonth(year, month + 1, closingDay);
  const closingDate = parseDate(closing);
  const due = dayInMonth(closingDate.year, closingDate.month + (dueDay > closingDay ? 0 : 1), dueDay);
  return { closing, due };
}

/** O fechamento de uma fatura a partir do vencimento (para mostrar a situação, RN-53b). */
export function closingForDue(due: string, closingDay: number, dueDay: number): string {
  const { year, month } = parseDate(due);
  return dayInMonth(year, month - (dueDay > closingDay ? 0 : 1), closingDay);
}

export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID';

/** RN-53b: aberta até o fechamento; fechada até o vencimento; atrasada depois dele; paga quando tudo está pago. */
export function invoiceStatus(invoice: Invoice, allPaid: boolean, today: string): InvoiceStatus {
  if (allPaid) return 'PAID';
  if (today <= invoice.closing) return 'OPEN';
  if (today <= invoice.due) return 'CLOSED';
  return 'OVERDUE';
}

/**
 * RN-56: valores das parcelas. Com o total, divide em centavos e põe a sobra na primeira parcela;
 * com o valor da parcela, todas são iguais (o total já inclui os juros).
 */
export function installmentAmounts(amountCents: number, count: number, mode: 'TOTAL' | 'INSTALLMENT'): number[] {
  if (mode === 'INSTALLMENT') return Array.from({ length: count }, () => amountCents);
  const base = Math.floor(amountCents / count);
  const remainder = amountCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

/** RN-56: a parcela i (a partir de 1) tem a data da primeira mais i − 1 meses, com a regra de último dia (RN-25b). */
export function installmentDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(firstDate, i));
}
