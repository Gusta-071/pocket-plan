import { z } from 'zod';

/** E-mail normalizado: sem espaços nas pontas e em minúsculas (RN-06). */
export const emailSchema = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'E-mail inválido.' }));

/** RN-07: mínimo de 8 caracteres, com pelo menos uma letra e um número. */
export const newPasswordSchema = z
  .string({ error: 'Informe a senha.' })
  .min(8, { error: 'A senha deve ter pelo menos 8 caracteres.' })
  .max(128, { error: 'A senha deve ter no máximo 128 caracteres.' })
  .regex(/\p{L}/u, { error: 'A senha deve ter pelo menos uma letra.' })
  .regex(/\d/, { error: 'A senha deve ter pelo menos um número.' });

export const registerSchema = z.object({
  // RN-05: nome de 2 a 80 caracteres.
  name: z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(2, { error: 'O nome deve ter pelo menos 2 caracteres.' })
    .max(80, { error: 'O nome deve ter no máximo 80 caracteres.' }),
  email: emailSchema,
  password: newPasswordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Informe a senha.' }).min(1, { error: 'Informe a senha.' }).max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const verifyEmailSchema = z.object({
  token: z.string({ error: 'Link inválido.' }).min(1, { error: 'Link inválido.' }),
});

export const resetPasswordSchema = z.object({
  token: z.string({ error: 'Link inválido.' }).min(1, { error: 'Link inválido.' }),
  password: newPasswordSchema,
});
