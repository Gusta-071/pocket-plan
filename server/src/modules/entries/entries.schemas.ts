import { z } from 'zod';
import { formatDate, isValidDate, maxEntryDate, MIN_ENTRY_DATE } from '../../../../shared/period.js';
import { CATEGORY_TYPES } from '../categories/categories.constants.js';

/** RN-20: maior que zero e no máximo R$ 10.000.000,00 (em centavos, RN-01). */
export const MAX_AMOUNT_CENTS = 10_000_000_00;

const dateSchema = z
  .string({ error: 'Informe a data.' })
  .refine(isValidDate, { error: 'Data inválida.' });

/** RN-23: de 01/01/2000 até 12 meses após hoje. */
export const entryDateSchema = dateSchema
  .refine((date) => date >= MIN_ENTRY_DATE, { error: 'A data deve ser a partir de 01/01/2000.' })
  .refine((date) => date <= maxEntryDate(), {
    error: () => `A data pode ser no máximo ${formatDate(maxEntryDate())} (12 meses à frente).`,
  });

const entryFields = {
  type: z.enum(CATEGORY_TYPES, { error: 'Escolha receita ou despesa.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int({ error: 'Valor inválido.' })
    .positive({ error: 'O valor deve ser maior que zero.' })
    .max(MAX_AMOUNT_CENTS, { error: 'O valor máximo é R$ 10.000.000,00.' }),
  date: entryDateSchema,
  categoryId: z.number({ error: 'Escolha a categoria.' }).int().positive({ error: 'Escolha a categoria.' }),
  // RN-19: descrição opcional, até 120 caracteres; vazia vira "sem descrição".
  description: z
    .string()
    .trim()
    .max(120, { error: 'A descrição deve ter no máximo 120 caracteres.' })
    .nullish()
    .transform((value) => (value ? value : null)),
  // RN-22: pago/recebido. Opcional: na criação, sem o campo, vale a sugestão pela data;
  // na edição, sem o campo, a situação atual é mantida (RN-24).
  paid: z.boolean({ error: 'Situação inválida.' }).optional(),
};

export const entrySchema = z.object(entryFields);

/** RN-22b: marcar ou desmarcar pela lista. */
export const paidSchema = z.object({ paid: z.boolean({ error: 'Informe se está pago.' }) });

export const entryIdSchema = z.coerce.number({ error: 'Lançamento inválido.' }).int().positive();

export const listEntriesQuerySchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    type: z.enum(CATEGORY_TYPES).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
  })
  .refine((query) => query.start <= query.end, { error: 'O início deve ser antes do fim.' });

/** RN-25b: de 1 a 12 repetições. */
export const repeatSchema = z.object({
  times: z
    .number({ error: 'Informe quantas vezes repetir.' })
    .int({ error: 'Escolha de 1 a 12 vezes.' })
    .min(1, { error: 'Escolha de 1 a 12 vezes.' })
    .max(12, { error: 'Escolha de 1 a 12 vezes.' }),
});
