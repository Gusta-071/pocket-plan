import { describe, expect, it } from 'vitest';
import { closingForDue, installmentAmounts, installmentDates, invoiceFor, invoiceStatus } from '../../shared/invoice.js';

// Testes de unidade das regras de fatura e parcelamento: funções puras, sem banco.

describe('em que fatura entra a compra (RN-53)', () => {
  // Cartão que fecha dia 23 e vence dia 2 (o exemplo da regra).
  it('até o dia do fechamento, inclusive, entra na fatura que fecha naquele mês', () => {
    expect(invoiceFor('2026-11-10', 23, 2)).toEqual({ closing: '2026-11-23', due: '2026-12-02' });
    expect(invoiceFor('2026-11-23', 23, 2)).toEqual({ closing: '2026-11-23', due: '2026-12-02' });
  });

  it('depois do fechamento, vai para a fatura seguinte', () => {
    expect(invoiceFor('2026-11-24', 23, 2)).toEqual({ closing: '2026-12-23', due: '2027-01-02' });
  });

  it('vencimento depois do fechamento no mesmo mês: vence no mesmo mês', () => {
    expect(invoiceFor('2026-11-05', 10, 17)).toEqual({ closing: '2026-11-10', due: '2026-11-17' });
    expect(invoiceFor('2026-11-11', 10, 17)).toEqual({ closing: '2026-12-10', due: '2026-12-17' });
  });

  it('virada de ano', () => {
    expect(invoiceFor('2026-12-28', 25, 5)).toEqual({ closing: '2027-01-25', due: '2027-02-05' });
  });

  it('dia que não existe no mês usa o último dia (RN-51)', () => {
    // Fecha dia 31 e vence dia 10: em fevereiro, fecha no dia 28.
    expect(invoiceFor('2027-02-15', 31, 10)).toEqual({ closing: '2027-02-28', due: '2027-03-10' });
    expect(invoiceFor('2027-03-01', 31, 10)).toEqual({ closing: '2027-03-31', due: '2027-04-10' });
    // Vence dia 30: em fevereiro, vence no dia 28.
    expect(invoiceFor('2027-01-10', 15, 30)).toEqual({ closing: '2027-01-15', due: '2027-01-30' });
    expect(invoiceFor('2027-02-10', 15, 30)).toEqual({ closing: '2027-02-15', due: '2027-02-28' });
  });

  it('acha o fechamento a partir do vencimento', () => {
    expect(closingForDue('2026-12-02', 23, 2)).toBe('2026-11-23');
    expect(closingForDue('2026-11-17', 10, 17)).toBe('2026-11-10');
    expect(closingForDue('2027-03-10', 31, 10)).toBe('2027-02-28');
  });
});

describe('situação da fatura (RN-53b)', () => {
  const invoice = { closing: '2026-11-23', due: '2026-12-02' };

  it('aberta até o fechamento, fechada até o vencimento, atrasada depois', () => {
    expect(invoiceStatus(invoice, false, '2026-11-23')).toBe('OPEN');
    expect(invoiceStatus(invoice, false, '2026-11-24')).toBe('CLOSED');
    expect(invoiceStatus(invoice, false, '2026-12-02')).toBe('CLOSED');
    expect(invoiceStatus(invoice, false, '2026-12-03')).toBe('OVERDUE');
  });

  it('paga quando tudo está pago, em qualquer data', () => {
    expect(invoiceStatus(invoice, true, '2026-11-01')).toBe('PAID');
    expect(invoiceStatus(invoice, true, '2027-01-01')).toBe('PAID');
  });
});

describe('parcelamento (RN-56)', () => {
  it('com o total, divide em centavos e põe a sobra na primeira parcela', () => {
    expect(installmentAmounts(10000, 3, 'TOTAL')).toEqual([3334, 3333, 3333]);
    expect(installmentAmounts(360000, 36, 'TOTAL')).toEqual(Array(36).fill(10000));
  });

  it('com o valor da parcela, todas são iguais e o total é parcela × número de parcelas (juros inclusos)', () => {
    const parcels = installmentAmounts(12500, 36, 'INSTALLMENT');
    expect(parcels).toHaveLength(36);
    expect(parcels.every((p) => p === 12500)).toBe(true);
    expect(parcels.reduce((a, b) => a + b, 0)).toBe(450000);
  });

  it('a soma das parcelas é sempre o total informado', () => {
    for (const [total, count] of [[100, 7], [99999, 13], [1, 1]] as const) {
      expect(installmentAmounts(total, count, 'TOTAL').reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('as datas seguem mês a mês, com a regra de último dia', () => {
    expect(installmentDates('2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(installmentDates('2026-11-10', 360).at(-1)).toBe('2056-10-10');
  });
});
