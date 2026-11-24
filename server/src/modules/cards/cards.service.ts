import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { categoryNameKey, type CategoryColor } from '../categories/categories.constants.js';
import { MAX_CARDS, type createCardSchema, type updateCardSchema } from './cards.schemas.js';

export type PublicCard = {
  id: number;
  name: string;
  color: CategoryColor;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  archived: boolean;
};

type CardRow = { id: number; name: string; color: string; limitCents: number; closingDay: number; dueDay: number; archivedAt: Date | null };

function toPublic(card: CardRow): PublicCard {
  return {
    id: card.id,
    name: card.name,
    color: card.color as CategoryColor,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    archived: card.archivedAt !== null,
  };
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
  const cards = await prisma.card.findMany({ where: { userId } });
  return cards
    .map(toPublic)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

/** RN-51 */
export async function createCard(userId: number, input: z.infer<typeof createCardSchema>): Promise<PublicCard> {
  if ((await prisma.card.count({ where: { userId } })) >= MAX_CARDS) {
    throw new AppError(409, 'CARD_LIMIT_REACHED', `Você já tem ${MAX_CARDS} cartões, que é o máximo. Exclua ou reaproveite um deles.`);
  }
  try {
    return toPublic(await prisma.card.create({ data: { userId, ...input, nameKey: categoryNameKey(input.name) } }));
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
    return toPublic(card);
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
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
