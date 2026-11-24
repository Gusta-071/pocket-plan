const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (valores em centavos, RN-01). */
export function formatMoney(cents: number): string {
  return formatter.format(cents / 100).replace(/ /g, ' ');
}

/** Valor com sinal: receitas positivas, despesas negativas. */
export function formatSigned(cents: number, type: 'INCOME' | 'EXPENSE'): string {
  return `${type === 'INCOME' ? '+' : '−'} ${formatMoney(cents)}`;
}
