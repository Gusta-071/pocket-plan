/**
 * Mês financeiro (RN-10 a RN-13), usado pela API e pela interface.
 * Datas são strings "AAAA-MM-DD" (RN-03): sem horário e sem fuso, para não haver deslocamentos.
 */

export const PERIOD_NAMINGS = ['AUTO', 'START_MONTH', 'END_MONTH'] as const;
export type PeriodNaming = (typeof PERIOD_NAMINGS)[number];

export type Period = { start: string; end: string; label: string };

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(year: number, month: number, day: number): string {
  // Date.UTC normaliza estouros (ex.: mês 13 vira janeiro do ano seguinte).
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** "Hoje" no fuso America/Sao_Paulo (RN-02). */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addDays(value: string, days: number): string {
  const { year, month, day } = parseDate(value);
  return toDateString(year, month, day + days);
}

/** Último dia do mês (1–12). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]}/${year}`;
}

/** Período que começa no mês informado: do dia D até o dia D − 1 do mês seguinte (RN-11). */
function periodStartingIn(year: number, month: number, startDay: number, naming: PeriodNaming): Period {
  const start = toDateString(year, month, startDay);
  const end = addDays(toDateString(year, month + 1, startDay), -1);
  return { start, end, label: periodLabel(start, end, naming) };
}

/** RN-12: nome do período. */
export function periodLabel(start: string, end: string, naming: PeriodNaming): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (naming === 'START_MONTH' || (s.year === e.year && s.month === e.month)) return monthLabel(s.year, s.month);
  if (naming === 'END_MONTH') return monthLabel(e.year, e.month);
  // Automático: o mês com mais dias dentro do período; empate fica com o mês de início.
  const daysInStartMonth = lastDayOfMonth(s.year, s.month) - s.day + 1;
  const daysInEndMonth = e.day;
  return daysInEndMonth > daysInStartMonth ? monthLabel(e.year, e.month) : monthLabel(s.year, s.month);
}

/** Período financeiro que contém a data (RN-11). */
export function periodContaining(date: string, startDay: number, naming: PeriodNaming): Period {
  const { year, month, day } = parseDate(date);
  return day >= startDay
    ? periodStartingIn(year, month, startDay, naming)
    : periodStartingIn(year, month - 1, startDay, naming);
}

/** Período `offset` meses antes (negativo) ou depois (positivo) do período que contém a data. */
export function shiftPeriod(date: string, offset: number, startDay: number, naming: PeriodNaming): Period {
  const current = periodContaining(date, startDay, naming);
  const { year, month } = parseDate(current.start);
  return periodStartingIn(year, month + offset, startDay, naming);
}

/** "05/11/2026" */
export function formatDate(value: string): string {
  const { year, month, day } = parseDate(value);
  return `${pad(day)}/${pad(month)}/${year}`;
}

/**
 * Mesma data `months` meses depois. Se o dia não existir no mês de destino,
 * usa o último dia desse mês (RN-25b): 31/01 + 1 mês = 28/02 (ou 29/02).
 */
export function addMonths(value: string, months: number): string {
  const { year, month, day } = parseDate(value);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  return toDateString(targetYear, targetMonth, Math.min(day, lastDayOfMonth(targetYear, targetMonth)));
}

/** Datas aceitas em lançamentos (RN-23): de 01/01/2000 até 12 meses após hoje. */
export const MIN_ENTRY_DATE = '2000-01-01';
export function maxEntryDate(todayValue = today()): string {
  return addMonths(todayValue, 12);
}

/** Confere se o texto é uma data real no formato "AAAA-MM-DD". */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDate(value);
  return toDateString(year, month, day) === value;
}
