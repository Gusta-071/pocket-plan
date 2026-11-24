import type { z } from 'zod';
import { addMonths, formatDate, maxEntryDate, today } from '../../../../shared/period.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { installmentAmounts, installmentDates, invoiceFor } from '../../../../shared/invoice.js';
import type { CategoryType } from '../categories/categories.constants.js';
import type { entrySchema, listEntriesQuerySchema, updateEntrySchema } from './entries.schemas.js';

export type PublicEntry = {
  id: number;
  type: CategoryType;
  amountCents: number;
  /** Data da compra ou do recebimento. */
  date: string;
  /** RN-52a: quando o dinheiro sai ou entra; no cartão, o vencimento da fatura (RN-53). */
  payDate: string;
  categoryId: number;
  description: string | null;
  /** RN-22: pago (despesa) ou recebido (receita). No cartão, segue a fatura (RN-54). */
  paid: boolean;
  /** RN-22a: pendente com data de pagamento anterior a hoje. Calculado, nunca armazenado. */
  overdue: boolean;
  /** RN-67: só nas despesas. */
  paymentMethodId: number | null;
  /** RN-52: só nas compras no crédito. */
  cardId: number | null;
  /** RN-56: parcela "número de total", quando faz parte de um parcelamento. */
  installment: { id: number; number: number; count: number } | null;
};

type EntryRow = {
  id: number;
  type: string;
  amountCents: number;
  date: string;
  payDate: string;
  categoryId: number;
  description: string | null;
  paid: boolean;
  paymentMethodId: number | null;
  cardId: number | null;
  installmentId: number | null;
  installmentNumber: number | null;
  installment?: { count: number } | null;
};

/** Para trazer o total de parcelas junto com o lançamento. */
const withInstallment = { installment: { select: { count: true } } } as const;

/** RN-22: sugestão de situação pela data. Até hoje, pago/recebido; futura, pendente. */
export function suggestedPaid(date: string, todayValue = today()): boolean {
  return date <= todayValue;
}

export function toPublicEntry(entry: EntryRow, todayValue: string): PublicEntry {
  return {
    id: entry.id,
    type: entry.type as CategoryType,
    amountCents: entry.amountCents,
    date: entry.date,
    payDate: entry.payDate,
    categoryId: entry.categoryId,
    description: entry.description,
    paid: entry.paid,
    overdue: !entry.paid && entry.payDate < todayValue,
    paymentMethodId: entry.paymentMethodId,
    cardId: entry.cardId,
    installment:
      entry.installmentId && entry.installmentNumber && entry.installment
        ? { id: entry.installmentId, number: entry.installmentNumber, count: entry.installment.count }
        : null,
  };
}

type EntryInput = z.infer<typeof entrySchema> | z.infer<typeof updateEntrySchema>;

/** RN-21: a categoria deve ser do usuário e do mesmo tipo do lançamento. */
async function checkCategory(userId: number, input: EntryInput) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) {
    throw new AppError(400, 'INVALID_CATEGORY', 'Categoria inválida.', [{ path: 'categoryId', message: 'Escolha uma das suas categorias.' }]);
  }
  if (category.type !== input.type) {
    const message = `Escolha uma categoria de ${input.type === 'INCOME' ? 'receita' : 'despesa'}.`;
    throw new AppError(400, 'CATEGORY_TYPE_MISMATCH', message, [{ path: 'categoryId', message }]);
  }
}

const fieldError = (code: string, path: string, message: string) => new AppError(400, code, message, [{ path, message }]);

type Payment = { paymentMethodId: number | null; cardId: number | null; card: { closingDay: number; dueDay: number } | null };

/**
 * RN-67 a RN-70, RN-52: confere a forma de pagamento e o cartão e devolve os valores a gravar.
 * `current` é o lançamento sendo editado: ele pode manter a "Não informada" (RN-70)
 * e um cartão que foi arquivado depois da compra (RN-57).
 */
async function checkPayment(userId: number, input: EntryInput, current?: { paymentMethodId: number | null; cardId: number | null }): Promise<Payment> {
  if (input.type === 'INCOME') {
    if (input.paymentMethodId) throw fieldError('INCOME_WITHOUT_PAYMENT_METHOD', 'paymentMethodId', 'Receitas não têm forma de pagamento.');
    if (input.cardId) throw fieldError('INCOME_WITHOUT_CARD', 'cardId', 'Receitas não podem ter cartão.');
    return { paymentMethodId: null, cardId: null, card: null };
  }

  if (!input.paymentMethodId) throw fieldError('PAYMENT_METHOD_REQUIRED', 'paymentMethodId', 'Escolha a forma de pagamento.');
  const method = await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId } });
  if (!method) throw fieldError('INVALID_PAYMENT_METHOD', 'paymentMethodId', 'Escolha uma das suas formas de pagamento.');
  if (method.kind === 'UNSPECIFIED' && current?.paymentMethodId !== method.id) {
    throw fieldError('PAYMENT_METHOD_REQUIRED', 'paymentMethodId', 'Escolha a forma de pagamento.');
  }

  if (method.kind !== 'CREDIT') {
    if (input.cardId) throw fieldError('CARD_ONLY_ON_CREDIT', 'cardId', 'Só compras no crédito têm cartão.');
    return { paymentMethodId: method.id, cardId: null, card: null };
  }

  if (!input.cardId) throw fieldError('CARD_REQUIRED', 'cardId', 'Escolha o cartão usado na compra.');
  const card = await prisma.card.findFirst({ where: { id: input.cardId, userId } });
  if (!card) throw fieldError('INVALID_CARD', 'cardId', 'Escolha um dos seus cartões.');
  if (card.archivedAt && current?.cardId !== card.id) {
    throw fieldError('CARD_ARCHIVED', 'cardId', 'Este cartão está arquivado. Reative-o nos ajustes para usá-lo em compras novas.');
  }
  return { paymentMethodId: method.id, cardId: card.id, card };
}

/** RN-52a, RN-53: no cartão, a data de pagamento é o vencimento da fatura; à vista, a própria data. */
function payDateFor(date: string, card: Payment['card']): string {
  return card ? invoiceFor(date, card.closingDay, card.dueDay).due : date;
}

/** RN-54: a fatura (cartão + vencimento) está inteira paga? Uma compra nova nela a reabre. */
async function invoiceWasPaid(userId: number, cardId: number, payDate: string, exceptIds: number[] = []): Promise<boolean> {
  const where = { userId, cardId, payDate, id: { notIn: exceptIds } };
  const [total, paid] = await Promise.all([prisma.entry.count({ where }), prisma.entry.count({ where: { ...where, paid: true } })]);
  return total > 0 && total === paid;
}

const REOPENED_WARNING = (payDate: string) =>
  `A fatura que vence em ${formatDate(payDate)} já estava paga e voltou a ficar pendente com esta compra.`;

/** Lançamento do usuário; de outro usuário responde como inexistente (RN-04). */
async function findOwned(userId: number, id: number) {
  const entry = await prisma.entry.findFirst({ where: { id, userId }, include: withInstallment });
  if (!entry) throw new AppError(404, 'ENTRY_NOT_FOUND', 'Lançamento não encontrado.');
  return entry;
}

/**
 * Lançamentos de um intervalo de datas (normalmente um período financeiro), pela data da compra (RN-52a), com totais.
 * Os totais seguem os filtros aplicados e separam pago/recebido de pendente.
 */
export async function listEntries(userId: number, query: z.infer<typeof listEntriesQuerySchema>) {
  const todayValue = today();
  const rows = await prisma.entry.findMany({
    where: {
      userId,
      date: { gte: query.start, lte: query.end },
      ...(query.type && { type: query.type }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.paymentMethodId && { paymentMethodId: query.paymentMethodId }),
      ...(query.cardId && { cardId: query.cardId }),
    },
    include: withInstallment,
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  const entries = rows.map((row) => toPublicEntry(row, todayValue));

  const totals = { incomePaid: 0, incomePending: 0, expensePaid: 0, expensePending: 0 };
  let overdueCount = 0;
  for (const entry of entries) {
    const key = `${entry.type === 'INCOME' ? 'income' : 'expense'}${entry.paid ? 'Paid' : 'Pending'}` as const;
    totals[key] += entry.amountCents;
    if (entry.overdue) overdueCount += 1;
  }
  const result = totals.incomePaid - totals.expensePaid;
  const projected = result + totals.incomePending - totals.expensePending;

  return { entries, totals: { ...totals, result, projected, overdueCount } };
}

type CreateInput = z.infer<typeof entrySchema>;

/**
 * RN-19 a RN-23, RN-52 a RN-56. Duplicar (RN-25a) também usa esta rota, com os dados ajustados.
 * Com `installments`, cria o parcelamento inteiro numa transação.
 */
export async function createEntry(userId: number, input: CreateInput) {
  await checkCategory(userId, input);
  const payment = await checkPayment(userId, input);
  const todayValue = today();
  const { installments, ...fields } = input;
  const base = { ...fields, paymentMethodId: payment.paymentMethodId, cardId: payment.cardId, userId };

  if (!installments) {
    const payDate = payDateFor(input.date, payment.card);
    // RN-54: no cartão, a compra nasce pendente; o check é o da fatura.
    const reopened = payment.cardId !== null && (await invoiceWasPaid(userId, payment.cardId, payDate));
    const paid = payment.cardId !== null ? false : (input.paid ?? suggestedPaid(input.date, todayValue));
    const entry = await prisma.entry.create({ data: { ...base, payDate, paid }, include: withInstallment });
    return { entry: toPublicEntry(entry, todayValue), ...(reopened && { warning: REOPENED_WARNING(payDate) }) };
  }

  // RN-56: valores, datas e faturas de cada parcela.
  const amounts = installmentAmounts(input.amountCents, installments.count, installments.mode);
  const dates = installmentDates(input.date, installments.count);
  const created = await prisma.$transaction(async (tx) => {
    const group = await tx.installment.create({ data: { userId, count: installments.count } });
    const entries = [];
    for (let i = 0; i < installments.count; i++) {
      const date = dates[i]!;
      // A primeira parcela segue o check do formulário; as seguintes, a sugestão pela data. No cartão, a fatura (RN-54).
      const paid = payment.cardId !== null ? false : i === 0 ? (input.paid ?? suggestedPaid(date, todayValue)) : suggestedPaid(date, todayValue);
      entries.push(
        await tx.entry.create({
          data: { ...base, amountCents: amounts[i]!, date, payDate: payDateFor(date, payment.card), paid, installmentId: group.id, installmentNumber: i + 1 },
          include: withInstallment,
        }),
      );
    }
    return entries;
  });
  const publicEntries = created.map((e) => toPublicEntry(e, todayValue));
  return { entry: publicEntries[0]!, entries: publicEntries };
}

type UpdateInput = z.infer<typeof updateEntrySchema>;

/**
 * RN-24: todos os campos podem ser editados, com as validações da criação. Mudar a data não muda a situação.
 * RN-53a: a fatura só é recalculada se a data ou o cartão mudarem.
 * RN-56a: numa parcela, a alteração vale para todas as parcelas da compra.
 */
export async function updateEntry(userId: number, id: number, input: UpdateInput) {
  const current = await findOwned(userId, id);
  await checkCategory(userId, input);
  const payment = await checkPayment(userId, input, current);
  const todayValue = today();
  if (current.installmentId) return updateInstallment(userId, current, input, payment, todayValue);

  if (input.date > maxEntryDate(todayValue)) {
    throw fieldError('VALIDATION_ERROR', 'date', `A data pode ser no máximo ${formatDate(maxEntryDate(todayValue))} (12 meses à frente).`);
  }
  const moved = input.date !== current.date || payment.cardId !== current.cardId;
  const payDate = moved ? payDateFor(input.date, payment.card) : current.payDate;
  // RN-54: ao entrar numa fatura (outra, ou a primeira), a compra fica pendente como a fatura.
  const intoInvoice = payment.cardId !== null && (moved || current.cardId === null);
  const reopened = intoInvoice && (await invoiceWasPaid(userId, payment.cardId!, payDate, [id]));
  const paid = payment.cardId !== null ? (intoInvoice ? false : current.paid) : (input.paid ?? current.paid);

  const entry = await prisma.entry.update({
    where: { id },
    data: { ...input, paymentMethodId: payment.paymentMethodId, cardId: payment.cardId, payDate, paid },
    include: withInstallment,
  });
  return { entry: toPublicEntry(entry, todayValue), ...(reopened && { warning: REOPENED_WARNING(payDate) }) };
}

/** RN-56a: aplica a edição de uma parcela a todas as parcelas da mesma compra, numa transação. */
async function updateInstallment(
  userId: number,
  current: Awaited<ReturnType<typeof findOwned>>,
  input: UpdateInput,
  payment: Payment,
  todayValue: string,
) {
  const parcels = await prisma.entry.findMany({ where: { userId, installmentId: current.installmentId }, orderBy: { installmentNumber: 'asc' } });
  const dateChanged = input.date !== current.date;
  // A parcela editada fica com a data informada; as demais acompanham, mês a mês.
  const first = dateChanged ? addMonths(input.date, -(current.installmentNumber! - 1)) : parcels[0]!.date;
  if (dateChanged && first > maxEntryDate(todayValue)) {
    throw fieldError('VALIDATION_ERROR', 'date', `A primeira parcela pode ser no máximo em ${formatDate(maxEntryDate(todayValue))} (12 meses à frente).`);
  }
  const dates = dateChanged ? installmentDates(first, parcels.length) : parcels.map((p) => p.date);
  const cardChanged = payment.cardId !== current.cardId;

  await prisma.$transaction(
    parcels.map((parcel, i) => {
      const date = dates[i]!;
      const moved = dateChanged || cardChanged;
      const payDate = moved ? payDateFor(date, payment.card) : parcel.payDate;
      // A situação é de cada parcela; no cartão, segue a fatura e uma parcela que muda de fatura fica pendente.
      const paid =
        payment.cardId !== null ? (moved || parcel.cardId === null ? false : parcel.paid) : parcel.id === current.id ? (input.paid ?? parcel.paid) : parcel.paid;
      return prisma.entry.update({
        where: { id: parcel.id },
        data: {
          type: input.type,
          amountCents: input.amountCents,
          categoryId: input.categoryId,
          description: input.description,
          paymentMethodId: payment.paymentMethodId,
          cardId: payment.cardId,
          date,
          payDate,
          paid,
        },
      });
    }),
  );
  const entry = await prisma.entry.findUniqueOrThrow({ where: { id: current.id }, include: withInstallment });
  return { entry: toPublicEntry(entry, todayValue) };
}

/** RN-22b: marca ou desmarca como pago/recebido. No cartão, o check é o da fatura (RN-54). */
export async function setPaid(userId: number, id: number, paid: boolean): Promise<PublicEntry> {
  const entry = await findOwned(userId, id);
  if (entry.cardId !== null) {
    throw new AppError(400, 'PAID_BY_INVOICE', 'Compras no cartão são pagas pela fatura. Marque a fatura nas Contas do mês.');
  }
  return toPublicEntry(await prisma.entry.update({ where: { id }, data: { paid }, include: withInstallment }), today());
}

/** RN-25: exclusão definitiva (a confirmação fica na interface). Numa parcela, exclui o parcelamento inteiro (RN-56a). */
export async function deleteEntry(userId: number, id: number): Promise<void> {
  const entry = await findOwned(userId, id);
  if (entry.installmentId) await prisma.installment.delete({ where: { id: entry.installmentId } });
  else await prisma.entry.delete({ where: { id } });
}

/**
 * RN-25b a RN-25d: cria `times` cópias independentes nos meses seguintes.
 * Ou todas são criadas, ou nenhuma; se passar do limite de datas, informa quantas cabem.
 * Cada cópia recebe a situação sugerida pela própria data (RN-22); no cartão, entra pendente na sua fatura.
 */
export async function repeatEntry(userId: number, id: number, times: number): Promise<PublicEntry[]> {
  const original = await findOwned(userId, id);
  if (original.installmentId) {
    throw new AppError(400, 'INSTALLMENT_REPEAT', 'Parcelas não podem ser repetidas. Para mais meses, registre um parcelamento com mais parcelas.');
  }
  const dates = Array.from({ length: times }, (_, i) => addMonths(original.date, i + 1));

  const limit = maxEntryDate();
  const possible = dates.filter((date) => date <= limit).length;
  if (possible < times) {
    const message =
      possible === 0
        ? `Não é possível repetir: o próximo mês já passa do limite de ${formatDate(limit)} (12 meses à frente).`
        : `Só é possível repetir ${possible} ${possible === 1 ? 'vez' : 'vezes'}: depois disso, a data passa do limite de ${formatDate(limit)} (12 meses à frente).`;
    throw new AppError(400, 'REPEAT_LIMIT', message, [{ path: 'times', message }]);
  }

  const card = original.cardId ? await prisma.card.findUniqueOrThrow({ where: { id: original.cardId } }) : null;
  const todayValue = today();
  const data = dates.map((date) => ({
    userId,
    type: original.type,
    amountCents: original.amountCents,
    categoryId: original.categoryId,
    description: original.description,
    // RN-25b: as cópias mantêm a forma de pagamento e o cartão, como estão.
    paymentMethodId: original.paymentMethodId,
    cardId: original.cardId,
    date,
    payDate: payDateFor(date, card),
    paid: card ? false : suggestedPaid(date, todayValue),
  }));
  const created = await prisma.$transaction(data.map((copy) => prisma.entry.create({ data: copy, include: withInstallment })));
  return created.map((entry) => toPublicEntry(entry, todayValue));
}
