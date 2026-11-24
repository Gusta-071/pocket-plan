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
import { categoryNameKey, DEFAULT_CATEGORIES } from '../src/modules/categories/categories.constants.js';

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
    },
    include: { categories: true },
  });
  const categoryId = (type: string, name: string) => user.categories.find((c) => c.type === type && c.name === name)!.id;

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
        // RN-22: o que já passou está pago; o futuro, pendente. As exceções abaixo criam atrasados.
        paid: date <= todayValue,
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

  await prisma.entry.createMany({ data: rows });

  const dates = rows.map((r) => r.date).sort();
  const overdue = rows.filter((r) => !r.paid && r.date < todayValue).length;
  console.log(`Conta de demonstração criada: ${EMAIL} / ${PASSWORD}`);
  console.log(`${rows.length} lançamentos de ${dates[0]} a ${dates.at(-1)}, ${overdue} ${overdue === 1 ? 'atrasado' : 'atrasados'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
