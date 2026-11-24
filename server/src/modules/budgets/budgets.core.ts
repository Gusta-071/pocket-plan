/**
 * Regras de orçamento e metas (RN-29 a RN-34) como funções puras: recebem valores e devolvem
 * valores, sem banco nem relógio. O serviço busca os dados e chama estas funções
 * ("Functional Core, Imperative Shell"), o que permite testá-las isoladamente.
 */

export const BUDGET_KINDS = ['CATEGORY_LIMIT', 'CLASS_LIMIT', 'INVESTMENT_GOAL', 'SAVINGS_GOAL'] as const;
export type BudgetKind = (typeof BUDGET_KINDS)[number];

/** Classes que aceitam limite (RN-29, RN-29a). Investimento tem meta, e não teto (RN-29b). */
export const LIMITED_CLASSES = ['FIXED', 'VARIABLE'] as const;
export type LimitedClass = (typeof LIMITED_CLASSES)[number];

export type BudgetRecord = { id: number; amountCents: number | null; validFrom: string };

/**
 * RN-30: o valor que vale num período é o da alteração mais recente feita até o fim dele.
 * Alterações feitas depois não mudam o período; `null` quer dizer sem limite (ou removido).
 */
export function effectiveAmount(records: BudgetRecord[], periodEnd: string): number | null {
  let chosen: BudgetRecord | null = null;
  for (const record of records) {
    if (record.validFrom > periodEnd) continue;
    if (!chosen || record.validFrom > chosen.validFrom || (record.validFrom === chosen.validFrom && record.id > chosen.id)) {
      chosen = record;
    }
  }
  return chosen?.amountCents ?? null;
}

export type BudgetStatus = 'OK' | 'WARNING' | 'EXCEEDED';

export type BudgetUsage = {
  limitCents: number;
  consumedCents: number;
  committedCents: number;
  availableCents: number;
  /** Quanto do limite já foi usado (consumido + comprometido), em %, arredondado para baixo. */
  usedPercent: number;
  status: BudgetStatus;
};

/**
 * RN-31 e RN-32: consumido (pago), comprometido (pendente), disponível e alerta.
 * Atenção ao atingir `warningPercent` do limite; estourado ao passar de 100%.
 */
export function budgetUsage(limitCents: number, consumedCents: number, committedCents: number, warningPercent: number): BudgetUsage {
  const used = consumedCents + committedCents;
  // Em centavos inteiros, sem divisão: evita erro de arredondamento na fronteira (ex.: exatamente 80%).
  const status: BudgetStatus = used > limitCents ? 'EXCEEDED' : used * 100 >= limitCents * warningPercent ? 'WARNING' : 'OK';
  return {
    limitCents,
    consumedCents,
    committedCents,
    availableCents: limitCents - used,
    usedPercent: Math.floor((used * 100) / limitCents),
    status,
  };
}

/** RN-29a: a soma dos limites das categorias passou do limite da classe? Avisa, mas permite. */
export function categoryLimitsExceedClass(classLimitCents: number | null, categoryLimitsCents: number[]): boolean {
  if (classLimitCents === null) return false;
  return categoryLimitsCents.reduce((total, cents) => total + cents, 0) > classLimitCents;
}

/** RN-29b: a meta de investimento é atingida quando o investido pago chega ao valor da meta. */
export function investmentGoalProgress(goalCents: number, investedPaidCents: number, investedPendingCents: number) {
  return {
    goalCents,
    investedCents: investedPaidCents,
    pendingCents: investedPendingCents,
    remainingCents: Math.max(goalCents - investedPaidCents, 0),
    achieved: investedPaidCents >= goalCents,
    // Se os aportes pendentes forem pagos, a meta é atingida?
    projectedAchieved: investedPaidCents + investedPendingCents >= goalCents,
  };
}

/** RN-34: a meta de economia é atingida quando o resultado realizado chega à meta; mostra também o projetado. */
export function savingsGoalProgress(goalCents: number, resultCents: number, projectedCents: number) {
  return {
    goalCents,
    resultCents,
    projectedCents,
    remainingCents: Math.max(goalCents - resultCents, 0),
    achieved: resultCents >= goalCents,
    projectedAchieved: projectedCents >= goalCents,
  };
}
