import { z } from 'zod';
import { PERIOD_NAMINGS } from '../../../../shared/period.js';
import { newPasswordSchema, registerSchema } from '../auth/auth.schemas.js';

/** RN-42: mesmo limite de nome do cadastro (RN-05). */
export const profileSchema = z.object({ name: registerSchema.shape.name });

/** RN-10, RN-12, RN-44, RN-45. Envia só o que mudou. */
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
