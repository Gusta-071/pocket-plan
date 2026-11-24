export type CategoryType = 'INCOME' | 'EXPENSE';

export type Category = { id: number; type: CategoryType; name: string; color: CategoryColor };

/** Paleta fixa de RN-16a: as mesmas chaves do servidor, com a cor exibida e o nome para leitores de tela. */
export const CATEGORY_COLORS = {
  green: { hex: '#16a34a', label: 'Verde' },
  teal: { hex: '#0d9488', label: 'Verde-água' },
  cyan: { hex: '#0891b2', label: 'Ciano' },
  blue: { hex: '#2563eb', label: 'Azul' },
  indigo: { hex: '#4f46e5', label: 'Anil' },
  purple: { hex: '#9333ea', label: 'Roxo' },
  pink: { hex: '#db2777', label: 'Rosa' },
  red: { hex: '#dc2626', label: 'Vermelho' },
  orange: { hex: '#ea580c', label: 'Laranja' },
  amber: { hex: '#d97706', label: 'Âmbar' },
  lime: { hex: '#65a30d', label: 'Verde-limão' },
  slate: { hex: '#64748b', label: 'Cinza' },
} as const;

export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const TYPE_LABELS: Record<CategoryType, { plural: string; singular: string }> = {
  EXPENSE: { plural: 'Despesas', singular: 'despesa' },
  INCOME: { plural: 'Receitas', singular: 'receita' },
};
