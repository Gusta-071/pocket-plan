import { z } from 'zod';

/** RN-69: nome de 1 a 30 caracteres. */
export const paymentMethodNameSchema = z.object({
  name: z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(1, { error: 'Informe o nome.' })
    .max(30, { error: 'O nome deve ter no máximo 30 caracteres.' }),
});

export const paymentMethodIdSchema = z.coerce.number({ error: 'Forma de pagamento inválida.' }).int().positive();

export const deletePaymentMethodQuerySchema = z.object({
  moveTo: z.coerce.number({ error: 'Forma de destino inválida.' }).int().positive().optional(),
});
