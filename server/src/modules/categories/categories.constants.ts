export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** Paleta fixa de 12 cores (RN-16a). A interface traduz cada chave para a cor exibida. */
export const CATEGORY_COLORS = [
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'red',
  'orange',
  'amber',
  'lime',
  'slate',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** RN-16b */
export const MAX_CATEGORIES_PER_TYPE = 30;

/** Categorias de toda conta nova (RN-15). */
export const DEFAULT_CATEGORIES: { type: CategoryType; name: string; color: CategoryColor }[] = [
  { type: 'INCOME', name: 'Salário', color: 'green' },
  { type: 'INCOME', name: 'Freelance', color: 'teal' },
  { type: 'INCOME', name: 'Renda extra', color: 'cyan' },
  { type: 'INCOME', name: 'Outras receitas', color: 'slate' },
  { type: 'EXPENSE', name: 'Alimentação', color: 'orange' },
  { type: 'EXPENSE', name: 'Moradia', color: 'indigo' },
  { type: 'EXPENSE', name: 'Transporte', color: 'blue' },
  { type: 'EXPENSE', name: 'Saúde', color: 'red' },
  { type: 'EXPENSE', name: 'Educação', color: 'purple' },
  { type: 'EXPENSE', name: 'Lazer', color: 'pink' },
  { type: 'EXPENSE', name: 'Compras', color: 'amber' },
  { type: 'EXPENSE', name: 'Contas e serviços', color: 'cyan' },
  { type: 'EXPENSE', name: 'Assinaturas', color: 'teal' },
  { type: 'EXPENSE', name: 'Outras despesas', color: 'slate' },
];

/** Chave de unicidade do nome (RN-16): sem espaços nas pontas e em minúsculas. */
export function categoryNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}
