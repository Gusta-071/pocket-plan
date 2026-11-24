import { periodContaining, today, type PeriodNaming } from '../../../../shared/period.js';
import { prisma } from '../../lib/prisma.js';
import { toPublicEntry } from '../entries/entries.service.js';
import { buildChecklist, groupInvoices } from './bills.core.js';

const withInstallment = { installment: { select: { count: true } } } as const;

/**
 * Contas do mês (RN-50 a RN-50d) do período que contém `date`, pela data de pagamento (RN-52a):
 * o que vence no período, com as compras no cartão agrupadas em faturas.
 */
export async function getBills(userId: number, date: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const todayValue = today();
  const period = periodContaining(date, user.monthStartDay, user.periodNaming as PeriodNaming);
  const isCurrent = todayValue >= period.start && todayValue <= period.end;

  const [inPeriod, earlierPending] = await Promise.all([
    prisma.entry.findMany({ where: { userId, payDate: { gte: period.start, lte: period.end } }, include: withInstallment }),
    isCurrent
      ? prisma.entry.findMany({ where: { userId, paid: false, payDate: { lt: period.start } }, include: withInstallment })
      : Promise.resolve([]),
  ]);

  const items = (rows: typeof inPeriod) => groupInvoices(rows.map((r) => toPublicEntry(r, todayValue)));
  return {
    period: { ...period, isCurrent },
    ...buildChecklist(items(inPeriod), items(earlierPending), isCurrent),
  };
}
