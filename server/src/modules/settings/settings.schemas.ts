import { z } from 'zod';
import { PERIOD_NAMINGS } from '../../../../shared/period.js';
import { newPasswordSchema, registerSchema } from '../auth/auth.schemas.js';
import { MAX_AMOUNT_CENTS } from '../entries/entries.schemas.js';

/** RN-42: mesmo limite de nome do cadastro (RN-05). */
export const profileSchema = z.object({ name: registerSchema.shape.name });

const WARNING_ERROR = 'Escolha um nível de atenção de 0% a 100%.';

/** RN-10, RN-12, RN-32a, RN-44, RN-44a, RN-45. Envia só o que mudou. */
export const preferencesSchema = z
  .strictObject({
    monthStartDay: z
      .number({ error: 'Escolha um dia de 1 a 28.' })
      .int({ error: 'Escolha um dia de 1 a 28.' })
      .min(1, { error: 'Escolha um dia de 1 a 28.' })
      .max(28, { error: 'Escolha um dia de 1 a 28.' })
      .optional(),
    periodNaming: z.enum(PERIOD_NAMINGS, { error: 'Opção de nome inválida.' }).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM'], { error: 'Tema inválido.' }).optional(),
    // RN-44a: pode ser negativo, com o mesmo limite de valor dos lançamentos (RN-20).
    initialBalanceCents: z
      .number({ error: 'Informe o saldo inicial.' })
      .int({ error: 'Valor inválido.' })
      .min(-MAX_AMOUNT_CENTS, { error: 'O saldo inicial deve estar entre −R$ 10.000.000,00 e R$ 10.000.000,00.' })
      .max(MAX_AMOUNT_CENTS, { error: 'O saldo inicial deve estar entre −R$ 10.000.000,00 e R$ 10.000.000,00.' })
      .optional(),
    // RN-72b: por quantos dias um aviso dispensado fica fora do sino.
    noticeSnoozeDays: z
      .union([z.literal(1), z.literal(3), z.literal(7), z.literal(15), z.literal(30)], { error: 'Escolha 1, 3, 7, 15 ou 30 dias.' })
      .optional(),
    warningPercent: z
      .number({ error: WARNING_ERROR })
      .int({ error: WARNING_ERROR })
      .min(0, { error: WARNING_ERROR })
      .max(100, { error: WARNING_ERROR })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: 'Nada para alterar.' });

const currentPasswordSchema = z.string({ error: 'Informe a senha atual.' }).min(1, { error: 'Informe a senha atual.' }).max(128);

/** RN-43 */
export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
});

/** RN-47 */
export const deleteAccountSchema = z.object({ password: currentPasswordSchema });
