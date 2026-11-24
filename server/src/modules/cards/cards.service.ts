import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { today } from '../../../../shared/period.js';
import { budgetUsage, type BudgetStatus } from '../budgets/budgets.core.js';
import { categoryNameKey, type CategoryColor } from '../categories/categories.constants.js';
import { toPublicEntry } from '../entries/entries.service.js';
import { closingForDue, invoiceStatus, type InvoiceStatus } from '../../../../shared/invoice.js';
import { MAX_CARDS, type createCardSchema, type updateCardSchema } from './cards.schemas.js';

export type PublicCard = {
  id: number;
  name: string;
  color: CategoryColor;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  archived: boolean;
  /** RN-55: compras e parcelas ainda não pagas, inclusive de faturas futuras. */
  usedCents: number;
  availableCents: number;
  usageStatus: BudgetStatus;
};

type CardRow = { id: number; name: string; color: string; limitCents: number; closingDay: number; dueDay: number; archivedAt: Date | null };

function toPublic(card: CardRow, usedCents: number, warningPercent: number): PublicCard {
  return {
    id: card.id,
    name: card.name,
    color: card.color as CategoryColor,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    archived: card.archivedAt !== null,
    usedCents,
    availableCents: card.limitCents - usedCents,
    // RN-55: os mesmos níveis de alerta do orçamento (RN-32a).
    usageStatus: budgetUsage(card.limitCents, usedCents, 0, warningPercent).status,
  };
}

/** RN-55: quanto do limite está em uso em cada cartão do usuário. */
async function usageByCard(userId: number): Promise<{ used: Map<number, number>; warningPercent: number }> {
  const [groups, user] = await Promise.all([
    prisma.entry.groupBy({ by: ['cardId'], where: { userId, paid: false, cardId: { not: null } }, _sum: { amountCents: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { warningPercent: true } }),
  ]);
  return { used: new Map(groups.map((g) => [g.cardId!, g._sum.amountCents ?? 0])), warningPercent: user.warningPercent };
}

async function publicCard(userId: number, card: CardRow): Promise<PublicCard> {
  const { used, warningPercent } = await usageByCard(userId);
  return toPublic(card, used.get(card.id) ?? 0, warningPercent);
}

const nameInUse = () =>
  new AppError(409, 'CARD_NAME_IN_USE', 'Já existe um cartão com este nome.', [{ path: 'name', message: 'Já existe um cartão com este nome.' }]);

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Cartão do usuário; de outro usuário responde como inexistente (RN-04). */
export async function findOwnedCard(userId: number, id: number) {
  const card = await prisma.card.findFirst({ where: { id, userId } });
  if (!card) throw new AppError(404, 'CARD_NOT_FOUND', 'Cartão não encontrado.');
  return card;
}

/** Ativos primeiro, depois os arquivados; em ordem alfabética. */
export async function listCards(userId: number): Promise<PublicCard[]> {
  const [cards, { used, warningPercent }] = await Promise.all([prisma.card.findMany({ where: { userId } }), usageByCard(userId)]);
  return cards
    .map((card) => toPublic(card, used.get(card.id) ?? 0, warningPercent))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

/** RN-51 */
export async function createCard(userId: number, input: z.infer<typeof createCardSchema>): Promise<PublicCard> {
  if ((await prisma.card.count({ where: { userId } })) >= MAX_CARDS) {
    throw new AppError(409, 'CARD_LIMIT_REACHED', `Você já tem ${MAX_CARDS} cartões, que é o máximo. Exclua ou reaproveite um deles.`);
  }
  try {
    return publicCard(userId, await prisma.card.create({ data: { userId, ...input, nameKey: categoryNameKey(input.name) } }));
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

/** RN-51, RN-57: altera os dados; `archived` arquiva ou reativa. */
export async function updateCard(userId: number, id: number, input: z.infer<typeof updateCardSchema>): Promise<PublicCard> {
  const current = await findOwnedCard(userId, id);
  const { archived, ...fields } = input;
  try {
    const card = await prisma.card.update({
      where: { id },
      data: {
        ...fields,
        ...(fields.name !== undefined && { nameKey: categoryNameKey(fields.name) }),
        ...(archived !== undefined && { archivedAt: archived ? (current.archivedAt ?? new Date()) : null }),
      },
    });
    return publicCard(userId, card);
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

export type PublicInvoice = {
  due: string;
  closing: string;
  status: InvoiceStatus;
  totalCents: number;
  paidCents: number;
  entries: ReturnType<typeof toPublicEntry>[];
};

/**
 * RN-53, RN-53b: faturas do cartão, da mais recente para a mais antiga, com as compras de cada uma.
 * A fatura é o conjunto das compras com o mesmo vencimento (gravado em cada compra, RN-53a).
 */
export async function listInvoices(userId: number, cardId: number): Promise<PublicInvoice[]> {
  const card = await findOwnedCard(userId, cardId);
  const todayValue = today();
  const rows = await prisma.entry.findMany({
    where: { userId, cardId },
    include: { installment: { select: { count: true } } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const byDue = new Map<string, typeof rows>();
  for (const row of rows) byDue.set(row.payDate, [...(byDue.get(row.payDate) ?? []), row]);
  return [...byDue.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([due, entries]) => {
      const closing = closingForDue(due, card.closingDay, card.dueDay);
      const allPaid = entries.every((e) => e.paid);
      return {
        due,
        closing,
        status: invoiceStatus({ closing, due }, allPaid, todayValue),
        totalCents: entries.reduce((sum, e) => sum + e.amountCents, 0),
        paidCents: entries.filter((e) => e.paid).reduce((sum, e) => sum + e.amountCents, 0),
        entries: entries.map((e) => toPublicEntry(e, todayValue)),
      };
    });
}

/** RN-54: pagar a fatura marca como pagas todas as compras e parcelas dela; desmarcar volta todas para pendente. */
export async function setInvoicePaid(userId: number, cardId: number, due: string, paid: boolean): Promise<void> {
  await findOwnedCard(userId, cardId);
  const { count } = await prisma.entry.updateMany({ where: { userId, cardId, payDate: due }, data: { paid } });
  if (count === 0) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Fatura não encontrada.');
}

/** RN-57: só um cartão sem compras pode ser excluído; com compras, ele é arquivado. */
export async function deleteCard(userId: number, id: number): Promise<void> {
  await findOwnedCard(userId, id);
  const purchases = await prisma.entry.count({ where: { cardId: id } });
  if (purchases > 0) {
    throw new AppError(
      409,
      'CARD_HAS_ENTRIES',
      `Este cartão tem ${purchases} ${purchases === 1 ? 'compra' : 'compras'} e não pode ser excluído. Arquive-o para que não apareça nas compras novas.`,
    );
  }
  await prisma.card.delete({ where: { id } });
}
