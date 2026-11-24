import { periodContaining, today, type PeriodNaming } from '../../../../shared/period.js';
import { prisma } from '../../lib/prisma.js';
import { buildChecklist } from './bills.core.js';

type Row = {
  id: number;
  type: string;
  amountCents: number;
  date: string;
  categoryId: number;
  description: string | null;
  paid: boolean;
  paymentMethodId: number | null;
  cardId: number | null;
};

/** Contas do mês (RN-50) do período que contém `date`. */
export async function getBills(userId: number, date: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const todayValue = today();
  const period = periodContaining(date, user.monthStartDay, user.periodNaming as PeriodNaming);
  const isCurrent = todayValue >= period.start && todayValue <= period.end;

  const [inPeriod, earlierPending] = await Promise.all([
    prisma.entry.findMany({ where: { userId, date: { gte: period.start, lte: period.end } } }),
    isCurrent ? prisma.entry.findMany({ where: { userId, paid: false, date: { lt: period.start } } }) : Promise.resolve([]),
  ]);

  // Os mesmos campos da lista de lançamentos; atrasado é calculado na hora (RN-22a).
  const toPublic = (r: Row) => ({
    id: r.id,
    type: r.type,
    amountCents: r.amountCents,
    date: r.date,
    categoryId: r.categoryId,
    description: r.description,
    paid: r.paid,
    overdue: !r.paid && r.date < todayValue,
    paymentMethodId: r.paymentMethodId,
    cardId: r.cardId,
  });

  return {
    period: { ...period, isCurrent },
    ...buildChecklist(inPeriod.map(toPublic), earlierPending.map(toPublic), isCurrent),
  };
}
