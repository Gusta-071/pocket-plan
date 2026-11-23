import type { z } from 'zod';
import { addMonths, formatDate, maxEntryDate, today } from '../../../../shared/period.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { CategoryType } from '../categories/categories.constants.js';
import type { entrySchema, listEntriesQuerySchema } from './entries.schemas.js';

export type EntryStatus = 'REALIZED' | 'PLANNED';

export type PublicEntry = {
  id: number;
  type: CategoryType;
  amountCents: number;
  date: string;
  categoryId: number;
  description: string | null;
  /** RN-22: calculada pela data, nunca armazenada. */
  status: EntryStatus;
};

type EntryRow = { id: number; type: string; amountCents: number; date: string; categoryId: number; description: string | null };

/** RN-22: até hoje é realizado; depois de hoje, previsto. */
export function statusOf(date: string, todayValue = today()): EntryStatus {
  return date <= todayValue ? 'REALIZED' : 'PLANNED';
}

function toPublic(entry: EntryRow, todayValue: string): PublicEntry {
  return {
    id: entry.id,
    type: entry.type as CategoryType,
    amountCents: entry.amountCents,
    date: entry.date,
    categoryId: entry.categoryId,
    description: entry.description,
    status: statusOf(entry.date, todayValue),
  };
}

type EntryInput = z.infer<typeof entrySchema>;

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

/** Lançamento do usuário; de outro usuário responde como inexistente (RN-04). */
async function findOwned(userId: number, id: number) {
  const entry = await prisma.entry.findFirst({ where: { id, userId } });
  if (!entry) throw new AppError(404, 'ENTRY_NOT_FOUND', 'Lançamento não encontrado.');
  return entry;
}

/**
 * Lançamentos de um intervalo de datas (normalmente um período financeiro), com totais.
 * Os totais seguem os filtros aplicados e separam realizado de previsto (RN-26, RN-27).
 */
export async function listEntries(userId: number, query: z.infer<typeof listEntriesQuerySchema>) {
  const todayValue = today();
  const rows = await prisma.entry.findMany({
    where: {
      userId,
      date: { gte: query.start, lte: query.end },
      ...(query.type && { type: query.type }),
      ...(query.categoryId && { categoryId: query.categoryId }),
    },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  const entries = rows.map((row) => toPublic(row, todayValue));

  const totals = { incomeRealized: 0, incomePlanned: 0, expenseRealized: 0, expensePlanned: 0 };
  for (const entry of entries) {
    const key = `${entry.type === 'INCOME' ? 'income' : 'expense'}${entry.status === 'REALIZED' ? 'Realized' : 'Planned'}` as const;
    totals[key] += entry.amountCents;
  }
  const result = totals.incomeRealized - totals.expenseRealized; // RN-26
  const projected = result + totals.incomePlanned - totals.expensePlanned; // RN-27

  return { entries, totals: { ...totals, result, projected } };
}

/** RN-19 a RN-23. Duplicar (RN-25a) também usa esta rota, com os dados ajustados. */
export async function createEntry(userId: number, input: EntryInput): Promise<PublicEntry> {
  await checkCategory(userId, input);
  return toPublic(await prisma.entry.create({ data: { ...input, userId } }), today());
}

/** RN-24: todos os campos podem ser editados, com as validações da criação. */
export async function updateEntry(userId: number, id: number, input: EntryInput): Promise<PublicEntry> {
  await findOwned(userId, id);
  await checkCategory(userId, input);
  return toPublic(await prisma.entry.update({ where: { id }, data: input }), today());
}

/** RN-25: exclusão definitiva (a confirmação fica na interface). */
export async function deleteEntry(userId: number, id: number): Promise<void> {
  await findOwned(userId, id);
  await prisma.entry.delete({ where: { id } });
}

/**
 * RN-25b a RN-25d: cria `times` cópias independentes nos meses seguintes.
 * Ou todas são criadas, ou nenhuma; se passar do limite de datas, informa quantas cabem.
 */
export async function repeatEntry(userId: number, id: number, times: number): Promise<PublicEntry[]> {
  const original = await findOwned(userId, id);
  const dates = Array.from({ length: times }, (_, i) => addMonths(original.date, i + 1));

  const limit = maxEntryDate();
  const possible = dates.filter((date) => date <= limit).length;
  if (possible < times) {
    const message =
      possible === 0
        ? `Não é possível repetir: o próximo mês já passa do limite de ${formatDate(limit)} (12 meses à frente).`
        : `Só é possível repetir ${possible} vez(es): depois disso, a data passa do limite de ${formatDate(limit)} (12 meses à frente).`;
    throw new AppError(400, 'REPEAT_LIMIT', message, [{ path: 'times', message }]);
  }

  const data = dates.map((date) => ({
    userId,
    type: original.type,
    amountCents: original.amountCents,
    categoryId: original.categoryId,
    description: original.description,
    date,
  }));
  const created = await prisma.$transaction(data.map((copy) => prisma.entry.create({ data: copy })));
  const todayValue = today();
  return created.map((entry) => toPublic(entry, todayValue));
}
