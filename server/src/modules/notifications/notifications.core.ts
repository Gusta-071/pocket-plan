import { addDays, daysBetween } from '../../../../shared/period.js';

/**
 * Regras da central de avisos (RN-72) como uma função pura: recebe a situação já calculada
 * (painel e cartões) e devolve os avisos, sem banco nem relógio ("Functional Core, Imperative Shell").
 */

/** Contas a vencer entram no aviso de hoje até este número de dias à frente (RN-72). */
export const DUE_SOON_DAYS = 3;
/** Metas não atingidas entram nos avisos nestes últimos dias do período (RN-72). */
export const GOAL_WARNING_DAYS = 7;

type Status = 'OK' | 'WARNING' | 'EXCEEDED';

export type NotificationInput = {
  today: string;
  periodStart: string;
  periodEnd: string;
  overdue: { count: number; expenseCents: number; incomeCents: number };
  /** Contas pendentes dos próximos dias, já agrupadas (faturas como um item), com a data de pagamento. */
  upcoming: { payDate: string; amountCents: number; type: string }[];
  budget: {
    classes: { expenseClass: string; usedPercent: number; status: Status }[];
    categories: { categoryId: number; name: string; usedPercent: number; status: Status }[];
  };
  cards: { id: number; name: string; usedCents: number; limitCents: number; usageStatus: Status; archived: boolean }[];
  goals: {
    savings: { achieved: boolean; remainingCents: number } | null;
    investment: { achieved: boolean; remainingCents: number } | null;
  };
};

/**
 * Todo aviso tem uma chave, que identifica a situação (a mesma de um dia para o outro), e um nível,
 * que cresce quando ela piora: quantidade de contas, ou 1 = atenção e 2 = estourado (RN-72a, RN-72b).
 * O `href` leva à tela onde se resolve, com o item a destacar (RN-72c).
 */
type Base = { key: string; level: number; href: string };

export type Notification = Base &
  (
    | { kind: 'OVERDUE'; severity: 'danger'; count: number; expenseCents: number; incomeCents: number }
    | { kind: 'DUE_SOON'; severity: 'warning'; count: number; amountCents: number; untilDate: string }
    | { kind: 'BUDGET'; severity: 'danger' | 'warning'; name: string; isClass: boolean; usedPercent: number; status: Status }
    | { kind: 'CARD'; severity: 'danger' | 'warning'; name: string; usedPercent: number; status: Status }
    | { kind: 'GOAL'; severity: 'warning'; goal: 'SAVINGS' | 'INVESTMENT'; remainingCents: number; daysLeft: number }
  );

const severityOf = (status: Status) => (status === 'EXCEEDED' ? 'danger' : 'warning');
const levelOf = (status: Status) => (status === 'EXCEEDED' ? 2 : 1);
const highlight = (path: string, target: string) => `${path}?destaque=${encodeURIComponent(target)}`;

/** RN-72: os avisos da situação atual, os mais graves primeiro. */
export function buildNotifications(input: NotificationInput): Notification[] {
  const list: Notification[] = [];

  if (input.overdue.count > 0) {
    list.push({ key: 'overdue', level: input.overdue.count, kind: 'OVERDUE', severity: 'danger', href: highlight('/contas', 'atrasadas'), ...input.overdue });
  }

  const untilDate = addDays(input.today, DUE_SOON_DAYS);
  const dueSoon = input.upcoming.filter((u) => u.payDate >= input.today && u.payDate <= untilDate);
  if (dueSoon.length > 0) {
    list.push({
      key: 'due-soon',
      level: dueSoon.length,
      kind: 'DUE_SOON',
      severity: 'warning',
      href: highlight('/contas', 'a-vencer'),
      count: dueSoon.length,
      amountCents: dueSoon.filter((u) => u.type === 'EXPENSE').reduce((sum, u) => sum + u.amountCents, 0),
      untilDate,
    });
  }

  for (const c of input.budget.classes.filter((c) => c.status !== 'OK')) {
    list.push({
      key: `budget-class-${c.expenseClass}:${input.periodStart}`,
      level: levelOf(c.status),
      kind: 'BUDGET',
      severity: severityOf(c.status),
      href: highlight('/', `orcamento-classe-${c.expenseClass}`),
      name: c.expenseClass === 'FIXED' ? 'Despesas fixas' : 'Despesas variáveis',
      isClass: true,
      usedPercent: c.usedPercent,
      status: c.status,
    });
  }
  for (const c of input.budget.categories.filter((c) => c.status !== 'OK')) {
    list.push({
      key: `budget-category-${c.categoryId}:${input.periodStart}`,
      level: levelOf(c.status),
      kind: 'BUDGET',
      severity: severityOf(c.status),
      href: highlight('/', `orcamento-categoria-${c.categoryId}`),
      name: c.name,
      isClass: false,
      usedPercent: c.usedPercent,
      status: c.status,
    });
  }

  for (const card of input.cards.filter((c) => !c.archived && c.usageStatus !== 'OK')) {
    list.push({
      key: `card-${card.id}`,
      level: levelOf(card.usageStatus),
      kind: 'CARD',
      severity: severityOf(card.usageStatus),
      href: highlight('/configuracoes/pagamentos', `cartao-${card.id}`),
      name: card.name,
      usedPercent: Math.round((card.usedCents * 100) / card.limitCents),
      status: card.usageStatus,
    });
  }

  const daysLeft = daysBetween(input.today, input.periodEnd);
  if (daysLeft < GOAL_WARNING_DAYS) {
    for (const [goal, progress] of [
      ['SAVINGS', input.goals.savings],
      ['INVESTMENT', input.goals.investment],
    ] as const) {
      if (progress && !progress.achieved) {
        list.push({
          key: `goal-${goal}:${input.periodStart}`,
          level: 1,
          kind: 'GOAL',
          severity: 'warning',
          href: highlight('/', `meta-${goal}`),
          goal,
          remainingCents: progress.remainingCents,
          daysLeft,
        });
      }
    }
  }

  // Os mais graves primeiro; entre os iguais, mantém a ordem acima.
  return list.sort((a, b) => Number(b.severity === 'danger') - Number(a.severity === 'danger'));
}

export type NoticeState = { key: string; readLevel: number | null; dismissedUntil: string | null; dismissedLevel: number | null };

/**
 * RN-72a, RN-72b: aplica o que o usuário fez com cada aviso.
 * - Lido se foi clicado num nível igual ou maior que o atual; se piorou, volta a não lido.
 * - Dispensado até `dismissedUntil` (exclusive), a não ser que tenha piorado desde então.
 */
export function applyNoticeStates(notifications: Notification[], states: NoticeState[], today: string) {
  const byKey = new Map(states.map((s) => [s.key, s]));
  const visible: (Notification & { read: boolean })[] = [];
  const dismissed: (Notification & { dismissedUntil: string })[] = [];
  for (const n of notifications) {
    const state = byKey.get(n.key);
    const stillDismissed = state?.dismissedUntil != null && today < state.dismissedUntil && n.level <= (state.dismissedLevel ?? 0);
    if (stillDismissed) dismissed.push({ ...n, dismissedUntil: state!.dismissedUntil! });
    else visible.push({ ...n, read: state?.readLevel != null && n.level <= state.readLevel });
  }
  return { visible, dismissed, unread: visible.filter((n) => !n.read).length };
}
