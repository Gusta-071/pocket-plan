import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type LimitedClass = 'FIXED' | 'VARIABLE';
export type BudgetKind = 'CATEGORY_LIMIT' | 'CLASS_LIMIT' | 'INVESTMENT_GOAL' | 'SAVINGS_GOAL';
export type BudgetStatus = 'OK' | 'WARNING' | 'EXCEEDED';

/** Limites e metas em vigor no período atual (RN-29 a RN-34). */
export type Budgets = {
  categoryLimits: { categoryId: number; amountCents: number }[];
  classLimits: Record<LimitedClass, number | null>;
  /** RN-29a: a soma das categorias passou do limite da classe. */
  classWarnings: Record<LimitedClass, boolean>;
  investmentGoalCents: number | null;
  savingsGoalCents: number | null;
};

export type BudgetTarget =
  | { kind: 'CATEGORY_LIMIT'; categoryId: number }
  | { kind: 'CLASS_LIMIT'; expenseClass: LimitedClass }
  | { kind: 'INVESTMENT_GOAL' }
  | { kind: 'SAVINGS_GOAL' };

/** Define (ou remove, com `null`) um limite ou uma meta a partir do período atual (RN-30). */
export function saveBudget(target: BudgetTarget, amountCents: number | null): Promise<Budgets> {
  return api<Budgets>('/budgets', { method: 'PUT', body: JSON.stringify({ ...target, amountCents }) });
}

export function useBudgets() {
  const [budgets, setBudgets] = useState<Budgets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBudgets(await api<Budgets>('/budgets'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o orçamento.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { budgets, error, reload, setBudgets };
}

export const STATUS_LABELS: Record<BudgetStatus, string> = { OK: 'Dentro do limite', WARNING: 'Atenção', EXCEEDED: 'Estourado' };
