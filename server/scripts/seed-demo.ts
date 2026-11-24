/**
 * Cria (ou recria) uma conta de demonstração com alguns meses de lançamentos realistas,
 * para ver as telas com dados. Uso: `npm run db:seed`.
 *
 * Conta: demo@pocket-plan.local / demo1234
 *
 * As datas são relativas a hoje (5 meses para trás e 2 para a frente), então a demonstração
 * continua atual com o passar do tempo. Os valores "aleatórios" usam uma semente fixa:
 * rodar de novo gera os mesmos dados.
 */
import { lastDayOfMonth, maxEntryDate, parseDate, toDateString, today } from '../../shared/period.js';
import { hashPassword } from '../src/lib/crypto.js';
import { prisma } from '../src/lib/prisma.js';
import { installmentAmounts, installmentDates, invoiceFor } from '../../shared/invoice.js';
import { categoryNameKey, DEFAULT_CATEGORIES } from '../src/modules/categories/categories.constants.js';
import { defaultPaymentMethodsData } from '../src/modules/payment-methods/payment-methods.constants.js';

const EMAIL = 'demo@pocket-plan.local';
const PASSWORD = 'demo1234';

// Gerador pseudoaleatório com semente (mulberry32): mesmos dados a cada execução.
let seed = 42;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => Math.round(min + random() * (max - min));
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

type Draft = { category: string; type: 'INCOME' | 'EXPENSE'; reais: number; day: number; description: string };

type Payment = { method: 'PIX' | 'DEBIT' | 'CREDIT' | 'CASH' | 'BOLETO' | 'VR'; card?: 'main' | 'store' };

/** Como cada gasto da demonstração foi pago (RN-67, RN-52). */
function paymentOf(description: string): Payment {
  switch (description) {
    case 'Aluguel':
    case 'Condomínio':
    case 'Mensalidade da faculdade':
      return { method: 'BOLETO' };
    case 'Conta de luz':
    case 'Internet':
    case 'Celular':
    case 'Combustível':
      return { method: 'DEBIT' };
    case 'Netflix':
    case 'Spotify':
    case 'Academia':
    case 'Uber':
      return { method: 'CREDIT', card: 'main' };
    case 'Mercado':
      return pick<Payment>([{ method: 'CREDIT', card: 'main' }, { method: 'DEBIT' }]);
    case 'Almoço no trabalho':
    case 'Padaria':
      return { method: 'VR' };
    case 'Farmácia':
      return { method: 'CASH' };
    case 'Roupas':
    case 'Casa e decoração':
    case 'Eletrônicos':
    case 'Presente':
      return { method: 'CREDIT', card: 'store' };
    default:
      return { method: 'PIX' };
  }
}

/** Lançamentos de um mês. `offset` 0 é o mês atual. */
function monthEntries(offset: number): Draft[] {
  const expense = (category: string, reais: number, day: number, description: string): Draft => ({ category, type: 'EXPENSE', reais, day, description });
  const income = (category: string, reais: number, day: number, description: string): Draft => ({ category, type: 'INCOME', reais, day, description });

  const entries: Draft[] = [
    income('Salário', 7200, 5, 'Salário'),
    expense('Moradia', 1650, 10, 'Aluguel'),
    expense('Moradia', 480, 10, 'Condomínio'),
    expense('Contas e serviços', between(140, 230), 15, 'Conta de luz'),
    expense('Contas e serviços', 99.9, 20, 'Internet'),
    expense('Contas e serviços', 59.9, 22, 'Celular'),
    expense('Assinaturas', 44.9, 8, 'Netflix'),
    expense('Assinaturas', 21.9, 12, 'Spotify'),
    expense('Saúde', 119.9, 5, 'Academia'),
    expense('Educação', 890, 10, 'Mensalidade da faculdade'),
  ];

  if ([-3, -1, 1].includes(offset)) entries.push(income('Freelance', pick([800, 1200, 1500]), 18, 'Projeto freelance'));
  if (offset === -2) entries.push(income('Renda extra', 350, 23, 'Venda de livros usados'));

  for (const day of [3, 11, 19, 26]) entries.push(expense('Alimentação', between(180, 520), day, 'Mercado'));
  for (let i = 0; i < between(3, 5); i++) {
    entries.push(expense('Alimentação', between(35, 120), between(1, 28), pick(['iFood', 'Restaurante', 'Padaria', 'Almoço no trabalho'])));
  }
  for (let i = 0; i < between(4, 6); i++) entries.push(expense('Transporte', between(15, 45), between(1, 28), 'Uber'));
  for (const day of [7, 21]) entries.push(expense('Transporte', between(200, 260), day, 'Combustível'));
  for (let i = 0; i < between(2, 3); i++) {
    entries.push(expense('Lazer', between(40, 180), between(1, 28), pick(['Cinema', 'Bar com amigos', 'Show', 'Passeio no fim de semana'])));
  }
  for (let i = 0; i < between(1, 2); i++) {
    entries.push(expense('Compras', between(80, 400), between(1, 28), pick(['Roupas', 'Presente', 'Eletrônicos', 'Casa e decoração'])));
  }
  entries.push(expense('Saúde', between(30, 90), between(1, 28), 'Farmácia'));

  // Aportes (RN-28): todo mês para a reserva; nos meses de freelance, também em investimentos.
  entries.push(expense('Reserva de emergência', 500, 6, 'Aporte na reserva'));
  if ([-3, -1, 1].includes(offset)) entries.push(expense('Investimentos', pick([300, 500]), 20, 'Tesouro Direto'));
  return entries;
}

async function main() {
  const todayValue = today();
  const limit = maxEntryDate(todayValue);
  const now = parseDate(todayValue);

  // Recria do zero: lançamentos antes das categorias, que os protegem (RN-18).
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.entry.deleteMany({ where: { userId: existing.id } });
    await prisma.card.deleteMany({ where: { userId: existing.id } });
    await prisma.paymentMethod.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      name: 'Conta Demo',
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      initialBalanceCents: 250000, // R$ 2.500,00 na conta quando começou a usar (RN-44a)
      categories: { create: DEFAULT_CATEGORIES.map((c) => ({ ...c, nameKey: categoryNameKey(c.name) })) },
      paymentMethods: {
        create: [...defaultPaymentMethodsData(), { kind: 'CUSTOM', name: 'Vale-refeição', nameKey: 'vale-refeição' }],
      },
      cards: {
        create: [
          { name: 'Cartão principal', nameKey: 'cartão principal', color: 'purple', limitCents: 600000, closingDay: 25, dueDay: 2 },
          { name: 'Cartão da loja', nameKey: 'cartão da loja', color: 'amber', limitCents: 150000, closingDay: 10, dueDay: 17 },
        ],
      },
    },
    include: { categories: true, paymentMethods: true, cards: true },
  });
  const methodId = (method: Payment['method']) =>
    user.paymentMethods.find((m) => (method === 'VR' ? m.kind === 'CUSTOM' : m.kind === method))!.id;
  const cardId = (card: Payment['card']) =>
    card ? user.cards.find((c) => c.name === (card === 'main' ? 'Cartão principal' : 'Cartão da loja'))!.id : null;
  const categoryId = (type: string, name: string) => user.categories.find((c) => c.type === type && c.name === name)!.id;
  // RN-52a, RN-53: no cartão, a data de pagamento é o vencimento da fatura.
  const payDateOf = (date: string, card: number | null) => {
    const found = user.cards.find((c) => c.id === card);
    return found ? invoiceFor(date, found.closingDay, found.dueDay).due : date;
  };

  const rows = [];
  for (let offset = -5; offset <= 2; offset++) {
    const monthStart = parseDate(toDateString(now.year, now.month + offset, 1));
    for (const draft of monthEntries(offset)) {
      const date = toDateString(monthStart.year, monthStart.month, Math.min(draft.day, lastDayOfMonth(monthStart.year, monthStart.month)));
      if (date > limit) continue;
      rows.push({
        userId: user.id,
        type: draft.type,
        amountCents: Math.round(draft.reais * 100),
        date,
        categoryId: categoryId(draft.type, draft.category),
        description: draft.description,
        ...(draft.type === 'EXPENSE'
          ? (({ method, card }) => ({ paymentMethodId: methodId(method), cardId: cardId(card) }))(paymentOf(draft.description))
          : { paymentMethodId: null, cardId: null }),
        // RN-22: o que já passou está pago; o futuro, pendente. As exceções abaixo criam atrasados.
        // No cartão, vale o vencimento da fatura (RN-54): faturas vencidas foram pagas.
        paid: date <= todayValue,
        payDate: date,
      });
    }
  }

  // Algumas contas esquecidas, para ver o "atrasado" (RN-22a): a internet do mês passado
  // e a conta de luz deste mês, se o dia dela já passou.
  const lastMonth = parseDate(toDateString(now.year, now.month - 1, 1));
  const lastMonthPrefix = `${lastMonth.year}-${String(lastMonth.month).padStart(2, '0')}`;
  const thisMonthPrefix = todayValue.slice(0, 7);
  for (const row of rows) {
    const forgotten =
      (row.description === 'Internet' && row.date.startsWith(lastMonthPrefix)) ||
      (row.description === 'Conta de luz' && row.date.startsWith(thisMonthPrefix));
    if (forgotten) row.paid = false;
  }

  for (const row of rows) {
    row.payDate = payDateOf(row.date, row.cardId);
    if (row.cardId !== null) row.paid = row.payDate < todayValue;
  }
  await prisma.entry.createMany({ data: rows });

  // Parcelamentos (RN-56): uma geladeira em 10x no cartão e um notebook em 12x no boleto, com juros.
  const installment = async (opts: { description: string; category: string; first: string; count: number; amountCents: number; mode: 'TOTAL' | 'INSTALLMENT'; method: Payment['method']; card?: Payment['card'] }) => {
    const group = await prisma.installment.create({ data: { userId: user.id, count: opts.count } });
    const amounts = installmentAmounts(opts.amountCents, opts.count, opts.mode);
    const card = cardId(opts.card);
    await prisma.entry.createMany({
      data: installmentDates(opts.first, opts.count).map((date, i) => {
        const payDate = payDateOf(date, card);
        return {
          userId: user.id,
          type: 'EXPENSE',
          amountCents: amounts[i]!,
          date,
          payDate,
          categoryId: categoryId('EXPENSE', opts.category),
          description: opts.description,
          paymentMethodId: methodId(opts.method),
          cardId: card,
          paid: payDate < todayValue,
          installmentId: group.id,
          installmentNumber: i + 1,
        };
      }),
    });
  };
  await installment({ description: 'Geladeira', category: 'Compras', first: toDateString(now.year, now.month - 3, 14), count: 10, amountCents: 459000, mode: 'TOTAL', method: 'CREDIT', card: 'main' });
  await installment({ description: 'Notebook', category: 'Educação', first: toDateString(now.year, now.month - 1, 8), count: 12, amountCents: 32990, mode: 'INSTALLMENT', method: 'BOLETO' });

  // Orçamento e metas (RN-29 a RN-34), valendo desde o primeiro mês da demonstração.
  // Lazer recebe um limite apertado, e Alimentação um perto do limite, para mostrar os alertas.
  const since = toDateString(now.year, now.month - 5, 1);
  const budget = (kind: string, amountCents: number, target: { categoryId?: number; expenseClass?: string } = {}) => ({
    userId: user.id,
    kind,
    amountCents,
    validFrom: since,
    ...target,
  });
  await prisma.budget.createMany({
    data: [
      budget('CATEGORY_LIMIT', 220000, { categoryId: categoryId('EXPENSE', 'Alimentação') }),
      budget('CATEGORY_LIMIT', 25000, { categoryId: categoryId('EXPENSE', 'Lazer') }),
      budget('CATEGORY_LIMIT', 80000, { categoryId: categoryId('EXPENSE', 'Transporte') }),
      budget('CLASS_LIMIT', 400000, { expenseClass: 'FIXED' }),
      budget('CLASS_LIMIT', 360000, { expenseClass: 'VARIABLE' }),
      budget('SAVINGS_GOAL', 100000),
      budget('INVESTMENT_GOAL', 80000),
    ],
  });

  const dates = rows.map((r) => r.date).sort();
  const overdue = rows.filter((r) => !r.paid && r.payDate < todayValue).length;
  console.log(`Conta de demonstração criada: ${EMAIL} / ${PASSWORD}`);
  console.log(`${rows.length} lançamentos de ${dates[0]} a ${dates.at(-1)}, ${overdue} ${overdue === 1 ? 'atrasado' : 'atrasados'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
