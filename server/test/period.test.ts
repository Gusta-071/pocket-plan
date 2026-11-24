import { describe, expect, it } from 'vitest';
import { addMonths, isValidDate, maxEntryDate, periodContaining, shiftPeriod, today } from '../../shared/period.js';

describe('mês financeiro', () => {
  it('com início no dia 1, coincide com o mês do calendário (RN-11)', () => {
    expect(periodContaining('2026-11-23', 1, 'AUTO')).toEqual({ start: '2026-11-01', end: '2026-11-30', label: 'Novembro/2026' });
    expect(periodContaining('2028-02-10', 1, 'AUTO').end).toBe('2028-02-29'); // ano bissexto
  });

  it('com início no dia 5: de 05/11 a 04/12 (RN-11)', () => {
    expect(periodContaining('2026-11-05', 5, 'AUTO')).toMatchObject({ start: '2026-11-05', end: '2026-12-04' });
    expect(periodContaining('2026-12-04', 5, 'AUTO')).toMatchObject({ start: '2026-11-05', end: '2026-12-04' });
    expect(periodContaining('2026-11-04', 5, 'AUTO')).toMatchObject({ start: '2026-10-05', end: '2026-11-04' });
  });

  it('passa a virada do ano', () => {
    expect(periodContaining('2027-01-10', 20, 'AUTO')).toMatchObject({ start: '2026-12-20', end: '2027-01-19' });
  });

  it('nome automático: mês com mais dias, empate fica com o de início (RN-12)', () => {
    expect(periodContaining('2026-11-10', 5, 'AUTO').label).toBe('Novembro/2026'); // 26 x 4
    expect(periodContaining('2026-11-25', 20, 'AUTO').label).toBe('Dezembro/2026'); // 11 x 19
    expect(periodContaining('2026-11-20', 16, 'AUTO').label).toBe('Novembro/2026'); // 15 x 15
  });

  it('nome pelo mês de início ou de término (RN-12)', () => {
    expect(periodContaining('2026-11-25', 20, 'START_MONTH').label).toBe('Novembro/2026');
    expect(periodContaining('2026-11-10', 5, 'END_MONTH').label).toBe('Dezembro/2026');
  });

  it('navega para períodos anteriores e seguintes', () => {
    expect(shiftPeriod('2026-11-23', -1, 1, 'AUTO')).toMatchObject({ start: '2026-10-01', label: 'Outubro/2026' });
    // Com início no dia 28, 23/11 está em 28/10–27/11; dois períodos depois: 28/12–27/01.
    expect(shiftPeriod('2026-11-23', 2, 28, 'AUTO')).toMatchObject({ start: '2026-12-28', end: '2027-01-27' });
  });

  it('hoje no fuso de São Paulo (RN-02)', () => {
    // 02:30 UTC de 24/11 ainda é 23/11 em São Paulo.
    expect(today(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23');
  });

  it('repetição mensal usa o último dia quando o dia não existe (RN-25b)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('limite de 12 meses à frente (RN-23) e datas válidas', () => {
    expect(maxEntryDate('2026-11-23')).toBe('2027-11-23');
    expect(maxEntryDate('2028-02-29')).toBe('2029-02-28');
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidDate('2026-02-28')).toBe(true);
  });
});
