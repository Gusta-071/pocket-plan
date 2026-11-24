import { z } from 'zod';
import { addDays, addMonths, isValidDate, lastDayOfMonth, maxEntryDate, MIN_ENTRY_DATE, parseDate, toDateString, today } from '../../../../shared/period.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { MAX_AMOUNT_CENTS } from '../entries/entries.schemas.js';
import { askModel, AssistantUnavailableError, type CategoryOption, type ChatTurn } from './assistant.model.js';

/** RN-66c: limite de mensagens ao assistente por usuário (o modelo local também ocupa a máquina). */
export const ASSISTANT_LIMIT = 20;
export const ASSISTANT_WINDOW_MS = 10 * 60 * 1000;

const recentRequests = new Map<number, number[]>();

/** Só para os testes: zera o limite entre um caso e outro. */
export function resetAssistantLimit() {
  recentRequests.clear();
}

function checkLimit(userId: number) {
  const now = Date.now();
  const recent = (recentRequests.get(userId) ?? []).filter((time) => now - time < ASSISTANT_WINDOW_MS);
  if (recent.length >= ASSISTANT_LIMIT) {
    throw new AppError(429, 'ASSISTANT_LIMIT', 'Você mandou muitas mensagens seguidas. Aguarde alguns minutos e tente de novo.');
  }
  recent.push(now);
  recentRequests.set(userId, recent);
}

export type Proposal = {
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  date: string;
  categoryId: number;
  categoryName: string;
  description: string;
  paid: boolean;
  repeatMonths: number;
};

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Tira acentos e caixa: "Amanhã" → "amanha". */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Converte a expressão de data que o modelo copiou da frase em "AAAA-MM-DD" (RN-03).
 * - "hoje", "ontem", "anteontem", "amanhã";
 * - "AAAA-MM-DD" e "DD/MM" ou "DD/MM/AAAA";
 * - "dia N": no mês atual se o dia ainda não passou ou se é um gasto único (já aconteceu);
 *   se repete todo mês e o dia já passou, a partir do mês que vem.
 * Expressões desconhecidas viram hoje.
 */
export function resolveWhen(when: string, todayValue: string, recurring: boolean): string {
  const text = plain(when);
  const now = parseDate(todayValue);
  const clampDay = (year: number, month: number, day: number) => toDateString(year, month, Math.min(day, lastDayOfMonth(year, month)));

  if (text.includes('anteontem')) return addDays(todayValue, -2);
  if (text.includes('ontem')) return addDays(todayValue, -1);
  if (text.includes('amanha')) return addDays(todayValue, 1);
  if (text === '' || text.includes('hoje') || text.includes('agora')) return todayValue;

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso && isValidDate(iso[0])) return iso[0];

  const br = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : now.year;
    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isValidDate(candidate)) return candidate;
  }

  const dayOnly = text.match(/dia\s+(\d{1,2})/) ?? text.match(/^(\d{1,2})$/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      if (day >= now.day || !recurring) return clampDay(now.year, now.month, day);
      const next = parseDate(toDateString(now.year, now.month + 1, 1));
      return clampDay(next.year, next.month, day);
    }
  }
  return todayValue;
}

/**
 * Valores em reais escritos no texto, em centavos: "45,90" → 4590; "1.500" → 150000; "2 mil" → 200000;
 * "mil" → 100000; "1,5 mil" → 150000. Serve para conferir que o modelo não inventou o valor (RN-66b).
 */
export function amountsIn(text: string): Set<number> {
  const found = new Set<number>();
  const normalized = plain(text);
  const pattern = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(\s*mil\b)?/g;
  for (const match of normalized.matchAll(pattern)) {
    const whole = Number(match[1]!.replace(/\./g, ''));
    const fraction = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
    const reais = whole + fraction / 100;
    found.add(Math.round(reais * (match[3] ? 1000 : 1) * 100));
  }
  if (/(^|\s)mil\b/.test(normalized.replace(/\d\s*mil/g, ''))) found.add(100_000);
  return found;
}

/**
 * Situação dita com todas as letras na frase (RN-22): "ainda não paguei", "vence", "vou pagar" → pendente;
 * "paguei", "recebi", "caiu" → pago. Sem sinal claro, null (vale o que o modelo entendeu ou a data).
 */
export function statusIn(text: string): 'pago' | 'pendente' | null {
  const t = plain(text);
  if (/\bnao (paguei|pago|recebi|caiu)\b|ainda nao|vou pagar|vou receber|a pagar|a receber|\bvence|\bvencer|pendente|em aberto/.test(t)) {
    return 'pendente';
  }
  if (/\b(paguei|pago|quitei|recebi|caiu|ganhei)\b/.test(t)) return 'pago';
  return null;
}

// O que o modelo devolve é conferido como qualquer dado de fora: o esquema garante o formato, não as regras.
const modelProposalSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number(),
  when: z.string(),
  category: z.string(),
  description: z.string(),
  status: z.enum(['pago', 'pendente', 'nao_informado']),
  repeatMonths: z.number(),
});
const modelAnswerSchema = z.object({ reply: z.string(), proposals: z.array(z.unknown()) });

/**
 * RN-66: conversa com o assistente. Devolve a resposta e as propostas já conferidas
 * contra as regras dos lançamentos (RN-19 a RN-25b). Nada é salvo aqui (RN-66a).
 */
export async function chat(userId: number, history: ChatTurn[]) {
  checkLimit(userId);

  const categories = await prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  const todayValue = today();
  const { year, month, day } = parseDate(todayValue);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
  const options: CategoryOption[] = categories.map((c) => ({ type: c.type as CategoryOption['type'], name: c.name }));

  let answer;
  try {
    answer = modelAnswerSchema.parse(await askModel({ today: todayValue, weekday, categories: options }, history));
  } catch (error) {
    if (error instanceof AssistantUnavailableError) throw new AppError(503, 'ASSISTANT_UNAVAILABLE', error.message);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new AppError(502, 'ASSISTANT_BAD_ANSWER', 'O assistente respondeu de um jeito inesperado. Tente escrever de outro jeito.');
    }
    throw error;
  }

  const limit = maxEntryDate(todayValue);
  const proposals: Proposal[] = [];
  let discarded = 0;
  let missingAmount = 0;
  const lastMessage = history.at(-1)?.content ?? '';
  // Valores que a pessoa realmente escreveu em algum momento da conversa.
  const written = new Set(history.filter((m) => m.role === 'user').flatMap((m) => [...amountsIn(m.content)]));
  // Categoria que a pessoa já usou para a mesma descrição (o histórico vale mais que o palpite do modelo).
  const past = await prisma.entry.findMany({
    where: { userId, description: { not: null } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 500,
    select: { type: true, description: true, categoryId: true },
  });
  const usedBefore = (type: string, description: string) =>
    past.find((e) => e.type === type && plain(e.description!) === plain(description))?.categoryId;
  for (const raw of answer.proposals) {
    const parsed = modelProposalSchema.safeParse(raw);
    if (!parsed.success) {
      discarded += 1;
      continue;
    }
    const p = parsed.data;
    // RN-25b: de 0 a 12 cópias.
    let repeatMonths = Math.min(Math.max(Math.round(p.repeatMonths), 0), 12);
    const date = resolveWhen(p.when, todayValue, repeatMonths > 0);
    const amountCents = Math.round(p.amount * 100);
    // RN-66b: modelos pequenos às vezes inventam um valor; só vale o que a pessoa escreveu.
    if (!written.has(amountCents)) {
      missingAmount += 1;
      continue;
    }
    // RN-20, RN-23: valor e data dentro dos limites; fora disso, a proposta é descartada.
    if (!(amountCents > 0) || amountCents > MAX_AMOUNT_CENTS || date < MIN_ENTRY_DATE || date > limit) {
      discarded += 1;
      continue;
    }
    // RN-21: categoria do usuário e do mesmo tipo; se o modelo errar, cai na "Outras" do tipo.
    const sameType = categories.filter((c) => c.type === p.type);
    const previousCategoryId = usedBefore(p.type, p.description);
    const category =
      sameType.find((c) => c.id === previousCategoryId) ??
      sameType.find((c) => c.name === p.category) ??
      sameType.find((c) => c.name.startsWith('Outras')) ??
      sameType[0];
    if (!category) {
      discarded += 1;
      continue;
    }
    // Só as repetições que cabem até o limite de datas (RN-23).
    while (repeatMonths > 0 && addMonths(date, repeatMonths) > limit) repeatMonths -= 1;
    // RN-22: o que a pessoa disse vale; sem informação, sugestão pela data. Com um lançamento só,
    // um sinal claro na frase ("ainda não paguei") vence o palpite do modelo pequeno.
    const status = (answer.proposals.length === 1 ? statusIn(lastMessage) : null) ?? p.status;
    const paid = status === 'pago' ? true : status === 'pendente' ? false : date <= todayValue;

    proposals.push({
      type: p.type,
      amountCents,
      date,
      categoryId: category.id,
      categoryName: category.name,
      description: p.description.trim().slice(0, 120),
      paid,
      repeatMonths,
    });
  }

  // Sem valor escrito e sem outra proposta, a resposta vira uma pergunta, como manda RN-66.
  if (missingAmount > 0 && proposals.length === 0) {
    return { reply: 'Qual foi o valor? Me diga quanto foi, por exemplo "R$ 120".', proposals, discarded };
  }
  return { reply: answer.reply, proposals, discarded: discarded + missingAmount };
}
