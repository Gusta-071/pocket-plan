import type { z } from 'zod';
import { periodContaining, today, type Period, type PeriodNaming } from '../../../../shared/period.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  categoryLimitsExceedClass,
  effectiveAmount,
  LIMITED_CLASSES,
  type BudgetKind,
  type BudgetRecord,
  type LimitedClass,
} from './budgets.core.js';
import type { setBudgetSchema } from './budgets.schemas.js';

type Row = BudgetRecord & { kind: string; categoryId: number | null; expenseClass: string | null };

/** Valores em vigor num período (RN-30), para as telas de edição e para o painel. */
export type EffectiveBudgets = {
  categoryLimits: Map<number, number>;
  classLimits: Record<LimitedClass, number | null>;
  investmentGoalCents: number | null;
  savingsGoalCents: number | null;
};

/** Agrupa os registros por alvo e escolhe, para cada um, o valor que vale no período. */
export function effectiveBudgets(rows: Row[], periodEnd: string): EffectiveBudgets {
  const of = (filter: (row: Row) => boolean) => effectiveAmount(rows.filter(filter), periodEnd);

  const categoryLimits = new Map<number, number>();
  const categoryIds = new Set(rows.filter((r) => r.kind === 'CATEGORY_LIMIT').map((r) => r.categoryId!));
  for (const categoryId of categoryIds) {
    const amount = of((r) => r.kind === 'CATEGORY_LIMIT' && r.categoryId === categoryId);
    if (amount !== null) categoryLimits.set(categoryId, amount);
  }

  return {
    categoryLimits,
    classLimits: {
      FIXED: of((r) => r.kind === 'CLASS_LIMIT' && r.expenseClass === 'FIXED'),
      VARIABLE: of((r) => r.kind === 'CLASS_LIMIT' && r.expenseClass === 'VARIABLE'),
    },
    investmentGoalCents: of((r) => r.kind === 'INVESTMENT_GOAL'),
    savingsGoalCents: of((r) => r.kind === 'SAVINGS_GOAL'),
  };
}

export async function loadBudgetRows(userId: number): Promise<Row[]> {
  return prisma.budget.findMany({ where: { userId } });
}

/** Limites e metas do período que contém `date`, com o aviso de RN-29a por classe. */
export async function getBudgets(userId: number, date: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const period: Period = periodContaining(date, user.monthStartDay, user.periodNaming as PeriodNaming);
  const [rows, categories] = await Promise.all([
    loadBudgetRows(userId),
    prisma.category.findMany({ where: { userId, type: 'EXPENSE' }, select: { id: true, expenseClass: true } }),
  ]);
  const effective = effectiveBudgets(rows, period.end);
  const classOf = new Map(categories.map((c) => [c.id, c.expenseClass]));

  // Só valem limites de categorias que ainda são Fixa ou Variável (RN-29).
  const categoryLimits = [...effective.categoryLimits]
    .filter(([categoryId]) => LIMITED_CLASSES.includes(classOf.get(categoryId) as LimitedClass))
    .map(([categoryId, amountCents]) => ({ categoryId, amountCents }));

  const classWarnings = Object.fromEntries(
    LIMITED_CLASSES.map((expenseClass) => [
      expenseClass,
      categoryLimitsExceedClass(
        effective.classLimits[expenseClass],
        categoryLimits.filter((l) => classOf.get(l.categoryId) === expenseClass).map((l) => l.amountCents),
      ),
    ]),
  ) as Record<LimitedClass, boolean>;

  return {
    period,
    categoryLimits,
    classLimits: effective.classLimits,
    classWarnings,
    investmentGoalCents: effective.investmentGoalCents,
    savingsGoalCents: effective.savingsGoalCents,
  };
}

type Target = { kind: BudgetKind; categoryId?: number; expenseClass?: string };

/** O banco ou uma transação em andamento: permite gravar o limite junto com a categoria. */
type Db = Prisma.TransactionClient;

/**
 * Grava um valor a partir de hoje (RN-30). Duas alterações no mesmo dia ficam num só registro:
 * o histórico guarda o valor de cada dia, e não cada clique.
 */
async function record(userId: number, target: Target, amountCents: number | null, db: Db = prisma) {
  const where = {
    userId,
    kind: target.kind,
    categoryId: target.categoryId ?? null,
    expenseClass: target.expenseClass ?? null,
    validFrom: today(),
  };
  const sameDay = await db.budget.findFirst({ where, orderBy: { id: 'desc' } });
  if (sameDay) await db.budget.update({ where: { id: sameDay.id }, data: { amountCents } });
  else await db.budget.create({ data: { ...where, amountCents } });
}

/** RN-29, RN-29a, RN-29b, RN-33: define ou remove um limite ou uma meta. */
export async function setBudget(userId: number, input: z.infer<typeof setBudgetSchema>) {
  if (input.kind === 'CATEGORY_LIMIT') {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId!, userId } });
    if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    if (category.type !== 'EXPENSE' || !LIMITED_CLASSES.includes(category.expenseClass as LimitedClass)) {
      throw new AppError(400, 'CATEGORY_WITHOUT_LIMIT', 'Só categorias de despesa fixas ou variáveis têm limite. Para investimentos, use a meta.', [
        { path: 'categoryId', message: 'Só categorias de despesa fixas ou variáveis têm limite.' },
      ]);
    }
  }
  await record(userId, { kind: input.kind, categoryId: input.categoryId, expenseClass: input.expenseClass }, input.amountCents);
  return getBudgets(userId, today());
}

/**
 * Define ou remove o limite de uma categoria a partir de hoje, sem gravar nada se o valor não muda.
 * Usado pela categoria, dentro da mesma transação em que ela é salva (RN-17, RN-29).
 */
export async function setCategoryLimit(db: Db, userId: number, categoryId: number, amountCents: number | null) {
  const rows = await db.budget.findMany({ where: { userId, kind: 'CATEGORY_LIMIT', categoryId } });
  if (effectiveAmount(rows, today()) !== amountCents) await record(userId, { kind: 'CATEGORY_LIMIT', categoryId }, amountCents, db);
}
