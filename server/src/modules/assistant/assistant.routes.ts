import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { assistantStatus } from './assistant.model.js';
import { chat } from './assistant.service.js';

export const assistantRoutes = Router();

assistantRoutes.use(requireAuth);

/**
 * A conversa fica no navegador e vem inteira a cada mensagem (o servidor não guarda nada).
 * Só as últimas mensagens são enviadas ao modelo, para limitar tamanho e custo.
 */
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1, { error: 'Escreva uma mensagem.' }).max(1000, { error: 'A mensagem deve ter no máximo 1.000 caracteres.' }),
      }),
    )
    .min(1, { error: 'Escreva uma mensagem.' })
    .max(40)
    .refine((messages) => messages.at(-1)?.role === 'user', { error: 'A última mensagem deve ser do usuário.' })
    .transform((messages) => {
      const recent = messages.slice(-12);
      // A conversa enviada ao modelo precisa começar por uma mensagem do usuário.
      return recent[0]?.role === 'assistant' ? recent.slice(1) : recent;
    }),
});

assistantRoutes.post('/chat', async (req, res) => {
  const { messages } = chatSchema.parse(req.body);
  res.json(await chat(currentUser(res).id, messages));
});

/** O modelo local está pronto? Se não, explica o que falta (Ollama parado ou modelo não baixado). */
assistantRoutes.get('/status', async (_req, res) => {
  res.json(await assistantStatus());
});
