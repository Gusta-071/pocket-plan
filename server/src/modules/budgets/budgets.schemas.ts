import { z } from 'zod';
import { isValidDate } from '../../../../shared/period.js';
import { MAX_AMOUNT_CENTS } from '../entries/entries.schemas.js';
import { BUDGET_KINDS, LIMITED_CLASSES } from './budgets.core.js';

const AMOUNT_ERROR = 'Informe um valor maior que zero e de no máximo R$ 10.000.000,00.';

/**
 * Define ou remove (amountCents: null) um limite ou uma meta, a partir do período atual (RN-30).
 * O alvo depende do tipo: categoria (CATEGORY_LIMIT), classe (CLASS_LIMIT) ou nenhum (metas).
 */
export const setBudgetSchema = z
  .strictObject({
    kind: z.enum(BUDGET_KINDS, { error: 'Tipo de orçamento inválido.' }),
    categoryId: z.number({ error: 'Categoria inválida.' }).int().positive().optional(),
    expenseClass: z.enum(LIMITED_CLASSES, { error: 'Só as classes Fixa e Variável têm limite.' }).optional(),
    amountCents: z
      .number({ error: AMOUNT_ERROR })
      .int({ error: AMOUNT_ERROR })
      .positive({ error: AMOUNT_ERROR })
      .max(MAX_AMOUNT_CENTS, { error: AMOUNT_ERROR })
      .nullable(),
  })
  .superRefine((data, ctx) => {
    const needsCategory = data.kind === 'CATEGORY_LIMIT';
    const needsClass = data.kind === 'CLASS_LIMIT';
    if (needsCategory !== (data.categoryId !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: needsCategory ? 'Escolha a categoria.' : 'Este tipo não tem categoria.' });
    }
    if (needsClass !== (data.expenseClass !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['expenseClass'], message: needsClass ? 'Escolha a classe.' : 'Este tipo não tem classe.' });
    }
  });

export const budgetsQuerySchema = z.object({
  date: z.string().refine(isValidDate, { error: 'Data inválida.' }).optional(),
});
