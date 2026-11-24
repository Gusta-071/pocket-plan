import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  categoryNameKey,
  MAX_CATEGORIES_PER_TYPE,
  type CategoryColor,
  type CategoryType,
  type ExpenseClass,
} from './categories.constants.js';
import type { createCategorySchema, updateCategorySchema } from './categories.schemas.js';

export type PublicCategory = {
  id: number;
  type: CategoryType;
  name: string;
  color: CategoryColor;
  expenseClass: ExpenseClass | null;
};

type CategoryRow = { id: number; type: string; name: string; color: string; expenseClass: string | null };

function toPublic(category: CategoryRow): PublicCategory {
  return {
    id: category.id,
    type: category.type as CategoryType,
    name: category.name,
    color: category.color as CategoryColor,
    expenseClass: category.expenseClass as ExpenseClass | null,
  };
}

const nameInUse = () =>
  new AppError(409, 'CATEGORY_NAME_IN_USE', 'Já existe uma categoria com este nome.', [
    { path: 'name', message: 'Já existe uma categoria com este nome.' },
  ]);

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Busca uma categoria do usuário. Categorias de outros usuários respondem como inexistentes (RN-04). */
async function findOwned(userId: number, id: number) {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
  return category;
}


/** Lista as categorias do usuário em ordem alfabética, receitas e despesas. */
export async function listCategories(userId: number): Promise<PublicCategory[]> {
  const categories = await prisma.category.findMany({ where: { userId } });
  return categories
    .map(toPublic)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

/** RN-14, RN-14a, RN-16, RN-16a, RN-16b. */
export async function createCategory(userId: number, input: z.infer<typeof createCategorySchema>) {
  const count = await prisma.category.count({ where: { userId, type: input.type } });
  if (count >= MAX_CATEGORIES_PER_TYPE) {
    throw new AppError(
      409,
      'CATEGORY_LIMIT_REACHED',
      `Você já tem ${MAX_CATEGORIES_PER_TYPE} categorias deste tipo, que é o máximo. Exclua ou reaproveite uma delas.`,
    );
  }
  try {
    const category = await prisma.category.create({
      data: {
        userId,
        type: input.type,
        name: input.name,
        nameKey: categoryNameKey(input.name),
        color: input.color,
        expenseClass: input.expenseClass,
      },
    });
    return toPublic(category);
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

/** RN-16, RN-17: altera nome, cor e/ou classe; o tipo nunca muda. */
export async function updateCategory(userId: number, id: number, input: z.infer<typeof updateCategorySchema>) {
  const current = await findOwned(userId, id);
  if (input.expenseClass !== undefined && current.type !== 'EXPENSE') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Categorias de receita não têm classe.', [
      { path: 'expenseClass', message: 'Categorias de receita não têm classe.' },
    ]);
  }
  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name, nameKey: categoryNameKey(input.name) }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.expenseClass !== undefined && { expenseClass: input.expenseClass }),
      },
    });
    return toPublic(category);
  } catch (error) {
    if (isUniqueViolation(error)) throw nameInUse();
    throw error;
  }
}

/** RN-18, RN-18a. `moveTo` é a categoria que recebe os lançamentos, quando houver. */
export async function deleteCategory(userId: number, id: number, moveTo: number | undefined): Promise<void> {
  const lastOfType = (type: string) =>
    new AppError(
      409,
      'LAST_CATEGORY_OF_TYPE',
      `Você precisa manter pelo menos uma categoria de ${type === 'INCOME' ? 'receita' : 'despesa'}. Renomeie esta em vez de excluí-la.`,
    );
  const hasEntries = (count: number) =>
    new AppError(
      409,
      'CATEGORY_HAS_ENTRIES',
      `Esta categoria tem ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}. Escolha para qual categoria movê-los antes de excluir.`,
    );

  // As conferências e as alterações ficam na mesma transação: ou tudo, ou nada (RN-18).
  // Assim, um lançamento criado no meio do caminho não deixa a exclusão pela metade.
  // A remoção do orçamento da categoria entra com a funcionalidade de orçamento.
  try {
    await prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, userId } });
      if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');

      if ((await tx.category.count({ where: { userId, type: category.type } })) <= 1) throw lastOfType(category.type);

      if (moveTo !== undefined) {
        if (moveTo === id) throw new AppError(400, 'INVALID_MOVE_TARGET', 'Escolha outra categoria para receber os lançamentos.');
        const target = await tx.category.findFirst({ where: { id: moveTo, userId } });
        if (!target || target.type !== category.type) {
          throw new AppError(400, 'INVALID_MOVE_TARGET', 'A categoria de destino deve ser sua e do mesmo tipo.');
        }
        await tx.entry.updateMany({ where: { categoryId: id, userId }, data: { categoryId: moveTo } });
      } else {
        const entries = await tx.entry.count({ where: { categoryId: id } });
        if (entries > 0) throw hasEntries(entries);
      }

      await tx.category.delete({ where: { id } });

      // RN-18a: confere de novo depois de excluir, caso outra exclusão tenha acontecido ao mesmo tempo.
      if ((await tx.category.count({ where: { userId, type: category.type } })) === 0) throw lastOfType(category.type);
    });
  } catch (error) {
    // A chave estrangeira (Restrict) recusou a exclusão: entrou um lançamento na categoria nesse meio-tempo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw hasEntries(await prisma.entry.count({ where: { categoryId: id } }));
    }
    throw error;
  }
}
