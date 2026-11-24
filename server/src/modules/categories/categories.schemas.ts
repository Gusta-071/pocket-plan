import { z } from 'zod';
import { MAX_AMOUNT_CENTS } from '../entries/entries.schemas.js';
import { CATEGORY_COLORS, CATEGORY_TYPES, EXPENSE_CLASSES } from './categories.constants.js';

const nameSchema = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(1, { error: 'Informe o nome.' })
  .max(40, { error: 'O nome deve ter no máximo 40 caracteres.' });

const colorSchema = z.enum(CATEGORY_COLORS, { error: 'Escolha uma cor da paleta.' });

const LIMIT_ERROR = 'Informe um limite maior que zero e de no máximo R$ 10.000.000,00.';

/** RN-29: limite mensal opcional, salvo junto com a categoria. `null` remove. */
const limitSchema = z
  .number({ error: LIMIT_ERROR })
  .int({ error: LIMIT_ERROR })
  .positive({ error: LIMIT_ERROR })
  .max(MAX_AMOUNT_CENTS, { error: LIMIT_ERROR })
  .nullable()
  .optional();

const CLASS_REQUIRED = 'Escolha a classe: fixa, variável ou investimento.';
const expenseClassSchema = z.enum(EXPENSE_CLASSES, { error: CLASS_REQUIRED });

// RN-14a: a classe é obrigatória nas despesas e não existe nas receitas.
export const createCategorySchema = z
  .object({
    type: z.enum(CATEGORY_TYPES, { error: 'Escolha receita ou despesa.' }),
    name: nameSchema,
    color: colorSchema,
    expenseClass: expenseClassSchema.nullish(),
    limitCents: limitSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === 'EXPENSE' && !data.expenseClass) {
      ctx.addIssue({ code: 'custom', path: ['expenseClass'], message: CLASS_REQUIRED });
    }
    if (data.type === 'INCOME' && data.expenseClass) {
      ctx.addIssue({ code: 'custom', path: ['expenseClass'], message: 'Categorias de receita não têm classe.' });
    }
  })
  .transform((data) => ({ ...data, expenseClass: data.type === 'EXPENSE' ? (data.expenseClass ?? null) : null }));

// `strict`: o tipo não pode ser alterado (RN-17), então enviar `type` é um erro.
export const updateCategorySchema = z
  .strictObject(
    { name: nameSchema.optional(), color: colorSchema.optional(), expenseClass: expenseClassSchema.optional(), limitCents: limitSchema },
    { error: 'Só é possível alterar o nome, a cor, a classe e o limite da categoria.' },
  )
  .refine((data) => Object.values(data).some((value) => value !== undefined), { error: 'Nada para alterar.' });

export const categoryIdSchema = z.coerce.number({ error: 'Categoria inválida.' }).int().positive();

export const deleteCategoryQuerySchema = z.object({
  moveTo: z.coerce.number({ error: 'Categoria de destino inválida.' }).int().positive().optional(),
});
