import { addDays, today } from '../../../../shared/period.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { listCards } from '../cards/cards.service.js';
import { getDashboard } from '../dashboard/dashboard.service.js';
import { applyNoticeStates, buildNotifications } from './notifications.core.js';

/** RN-72: os avisos da situação atual, calculados a partir do painel do período atual e dos cartões. */
async function currentNotifications(userId: number, todayValue: string) {
  const [dashboard, cards] = await Promise.all([getDashboard(userId, todayValue), listCards(userId)]);
  return buildNotifications({
    today: todayValue,
    periodStart: dashboard.period.start,
    periodEnd: dashboard.period.end,
    overdue: dashboard.overdue,
    upcoming: dashboard.upcoming,
    budget: dashboard.budget,
    cards,
    goals: dashboard.goals,
  });
}

/** RN-72, RN-72a, RN-72b: avisos visíveis (com lido ou não), a quantidade de não lidos e os dispensados. */
export async function listNotifications(userId: number) {
  const todayValue = today();
  const [notifications, states] = await Promise.all([
    currentNotifications(userId, todayValue),
    prisma.noticeState.findMany({ where: { userId } }),
  ]);
  // Situação resolvida: o que o usuário fez com o aviso deixa de valer. Se a situação voltar,
  // é uma notícia nova, e o aviso aparece como não lido (RN-72a).
  const current = new Set(notifications.map((n) => n.key));
  const resolved = states.filter((s) => !current.has(s.key));
  if (resolved.length > 0) await prisma.noticeState.deleteMany({ where: { userId, key: { in: resolved.map((s) => s.key) } } });

  const { visible, dismissed, unread } = applyNoticeStates(
    notifications,
    states.filter((s) => current.has(s.key)),
    todayValue,
  );
  return { notifications: visible, unread, dismissed };
}

/** O aviso atual com esta chave; se a situação já foi resolvida, ele não existe mais. */
async function findCurrent(userId: number, key: string) {
  const notification = (await currentNotifications(userId, today())).find((n) => n.key === key);
  if (!notification) throw new AppError(404, 'NOTICE_NOT_FOUND', 'Este aviso não existe mais: a situação já foi resolvida.');
  return notification;
}

const upsert = (userId: number, key: string, data: object) =>
  prisma.noticeState.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, ...data }, update: data });

/** RN-72a: lido no nível atual; se a situação piorar, volta a não lido. */
export async function markRead(userId: number, key: string) {
  const notification = await findCurrent(userId, key);
  await upsert(userId, key, { readLevel: notification.level });
}

/** RN-72b: fora do sino pelo número de dias das configurações, a não ser que a situação piore. */
export async function dismiss(userId: number, key: string) {
  const [notification, user] = await Promise.all([
    findCurrent(userId, key),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { noticeSnoozeDays: true } }),
  ]);
  const dismissedUntil = addDays(today(), user.noticeSnoozeDays);
  await upsert(userId, key, { dismissedUntil, dismissedLevel: notification.level });
  return { dismissedUntil };
}

/** RN-72b: mostrar de novo um aviso dispensado. */
export async function restore(userId: number, key: string) {
  await prisma.noticeState.updateMany({ where: { userId, key }, data: { dismissedUntil: null, dismissedLevel: null } });
}
