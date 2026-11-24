import { describe, expect, it } from 'vitest';
import {
  budgetUsage,
  categoryLimitsExceedClass,
  effectiveAmount,
  investmentGoalProgress,
  savingsGoalProgress,
} from '../src/modules/budgets/budgets.core.js';

// Testes de unidade do núcleo de regras: funções puras, sem banco nem servidor.

describe('vigência do limite (RN-30)', () => {
  const history = [
    { id: 1, amountCents: 80000, validFrom: '2026-09-10' },
    { id: 2, amountCents: 100000, validFrom: '2026-11-05' },
    { id: 3, amountCents: null, validFrom: '2027-01-02' },
  ];

  it('sem alteração até o fim do período, não há limite', () => {
    expect(effectiveAmount(history, '2026-08-31')).toBeNull();
  });

  it('vale a partir do período em que foi definido e se repete nos seguintes', () => {
    expect(effectiveAmount(history, '2026-09-30')).toBe(80000);
    expect(effectiveAmount(history, '2026-10-31')).toBe(80000);
  });

  it('uma alteração vale do seu período em diante; os anteriores mantêm o valor', () => {
    expect(effectiveAmount(history, '2026-11-30')).toBe(100000);
    expect(effectiveAmount(history, '2026-12-31')).toBe(100000);
    expect(effectiveAmount(history, '2026-10-31')).toBe(80000);
  });

  it('remover o limite vale do período da remoção em diante', () => {
    expect(effectiveAmount(history, '2027-01-31')).toBeNull();
  });

  it('duas alterações no mesmo dia: vale a mais recente', () => {
    const sameDay = [
      { id: 7, amountCents: 500, validFrom: '2026-11-05' },
      { id: 8, amountCents: 900, validFrom: '2026-11-05' },
    ];
    expect(effectiveAmount(sameDay, '2026-11-30')).toBe(900);
  });
});

describe('consumo e alertas (RN-31, RN-32, RN-32a)', () => {
  it('calcula consumido, comprometido e disponível', () => {
    expect(budgetUsage(100000, 30000, 20000, 80)).toEqual({
      limitCents: 100000,
      consumedCents: 30000,
      committedCents: 20000,
      availableCents: 50000,
      usedPercent: 50,
      status: 'OK',
    });
  });

  it('atenção ao atingir exatamente o nível escolhido, contando o comprometido', () => {
    expect(budgetUsage(100000, 79999, 0, 80).status).toBe('OK');
    expect(budgetUsage(100000, 60000, 20000, 80).status).toBe('WARNING');
  });

  it('usar 100% ainda não é estouro; passar de 100% é', () => {
    expect(budgetUsage(100000, 100000, 0, 80).status).toBe('WARNING');
    const over = budgetUsage(100000, 90000, 10001, 80);
    expect(over.status).toBe('EXCEEDED');
    expect(over.availableCents).toBe(-1);
  });

  it('a porcentagem é arredondada, sem contradizer o alerta nas fronteiras', () => {
    expect(budgetUsage(80000, 70000, 0, 80).usedPercent).toBe(88); // 87,5%
    expect(budgetUsage(100000, 99600, 0, 80)).toMatchObject({ usedPercent: 100, status: 'WARNING' }); // 99,6%
    expect(budgetUsage(100000, 100400, 0, 80)).toMatchObject({ usedPercent: 101, status: 'EXCEEDED' }); // 100,4%
    expect(budgetUsage(100000, 100001, 0, 80)).toMatchObject({ usedPercent: 101, status: 'EXCEEDED' });
  });

  it('o nível de atenção é do usuário: com 50%, avisa antes', () => {
    expect(budgetUsage(100000, 50000, 0, 50).status).toBe('WARNING');
    expect(budgetUsage(100000, 50000, 0, 100).status).toBe('OK');
  });
});

describe('soma dos limites das categorias x limite da classe (RN-29a)', () => {
  it('avisa só quando a soma passa do limite da classe', () => {
    expect(categoryLimitsExceedClass(100000, [60000, 40000])).toBe(false);
    expect(categoryLimitsExceedClass(100000, [60000, 40001])).toBe(true);
  });

  it('sem limite na classe, não há aviso', () => {
    expect(categoryLimitsExceedClass(null, [999999])).toBe(false);
  });
});

describe('metas (RN-29b, RN-34)', () => {
  it('meta de investimento: atingida quando o pago chega à meta; mostra quanto falta', () => {
    expect(investmentGoalProgress(100000, 60000, 40000)).toEqual({
      goalCents: 100000,
      investedCents: 60000,
      pendingCents: 40000,
      remainingCents: 40000,
      achieved: false,
      projectedAchieved: true,
    });
    expect(investmentGoalProgress(100000, 120000, 0)).toMatchObject({ remainingCents: 0, achieved: true });
  });

  it('meta de economia: compara o resultado realizado e o projetado', () => {
    expect(savingsGoalProgress(50000, 50000, 30000)).toMatchObject({ achieved: true, projectedAchieved: false });
    expect(savingsGoalProgress(50000, 20000, 60000)).toMatchObject({ achieved: false, projectedAchieved: true, remainingCents: 30000 });
    expect(savingsGoalProgress(50000, -10000, -10000)).toMatchObject({ achieved: false, remainingCents: 60000 });
  });
});
