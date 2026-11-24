import { z } from 'zod';
import { CATEGORY_COLORS, CATEGORY_TYPES } from './categories.constants.js';

const nameSchema = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(1, { error: 'Informe o nome.' })
  .max(40, { error: 'O nome deve ter no máximo 40 caracteres.' });

const colorSchema = z.enum(CATEGORY_COLORS, { error: 'Escolha uma cor da paleta.' });

export const createCategorySchema = z.object({
  type: z.enum(CATEGORY_TYPES, { error: 'Escolha receita ou despesa.' }),
  name: nameSchema,
  color: colorSchema,
});

// `strict`: o tipo não pode ser alterado (RN-17), então enviar `type` é um erro.
export const updateCategorySchema = z
  .strictObject(
    { name: nameSchema.optional(), color: colorSchema.optional() },
    { error: 'Só é possível alterar o nome e a cor da categoria.' },
  )
  .refine((data) => data.name !== undefined || data.color !== undefined, { error: 'Nada para alterar.' });

export const categoryIdSchema = z.coerce.number({ error: 'Categoria inválida.' }).int().positive();

export const deleteCategoryQuerySchema = z.object({
  moveTo: z.coerce.number({ error: 'Categoria de destino inválida.' }).int().positive().optional(),
});
