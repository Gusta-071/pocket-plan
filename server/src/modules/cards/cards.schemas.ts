import { z } from 'zod';
import { CATEGORY_COLORS } from '../categories/categories.constants.js';
import { MAX_AMOUNT_CENTS } from '../entries/entries.schemas.js';

/** RN-51: até 10 cartões por usuário. */
export const MAX_CARDS = 10;

const DAY_ERROR = 'Escolha um dia de 1 a 31.';
const daySchema = z.number({ error: DAY_ERROR }).int({ error: DAY_ERROR }).min(1, { error: DAY_ERROR }).max(31, { error: DAY_ERROR });
const LIMIT_ERROR = 'Informe um limite maior que zero e de no máximo R$ 10.000.000,00.';

const cardFields = {
  name: z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(1, { error: 'Informe o nome.' })
    .max(30, { error: 'O nome deve ter no máximo 30 caracteres.' }),
  color: z.enum(CATEGORY_COLORS, { error: 'Escolha uma cor da paleta.' }),
  limitCents: z
    .number({ error: LIMIT_ERROR })
    .int({ error: LIMIT_ERROR })
    .positive({ error: LIMIT_ERROR })
    .max(MAX_AMOUNT_CENTS, { error: LIMIT_ERROR }),
  closingDay: daySchema,
  dueDay: daySchema,
};

/** RN-51 */
export const createCardSchema = z.object(cardFields);

/** RN-51, RN-57: altera os dados e arquiva ou reativa o cartão. Envia só o que mudou. */
export const updateCardSchema = z
  .strictObject({
    name: cardFields.name.optional(),
    color: cardFields.color.optional(),
    limitCents: cardFields.limitCents.optional(),
    closingDay: daySchema.optional(),
    dueDay: daySchema.optional(),
    archived: z.boolean({ error: 'Informe se o cartão está arquivado.' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { error: 'Nada para alterar.' });

export const cardIdSchema = z.coerce.number({ error: 'Cartão inválido.' }).int().positive();
