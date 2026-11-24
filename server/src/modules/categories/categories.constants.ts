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

/** Classes das categorias de despesa (RN-14a). Categorias de receita não têm classe. */
export const EXPENSE_CLASSES = ['FIXED', 'VARIABLE', 'INVESTMENT'] as const;
export type ExpenseClass = (typeof EXPENSE_CLASSES)[number];

/** RN-16b */
export const MAX_CATEGORIES_PER_TYPE = 30;

/** Categorias de toda conta nova (RN-15). As de despesa vêm com uma classe sugerida (RN-14a). */
export const DEFAULT_CATEGORIES: { type: CategoryType; name: string; color: CategoryColor; expenseClass: ExpenseClass | null }[] = [
  { type: 'INCOME', name: 'Salário', color: 'green', expenseClass: null },
  { type: 'INCOME', name: 'Freelance', color: 'teal', expenseClass: null },
  { type: 'INCOME', name: 'Renda extra', color: 'cyan', expenseClass: null },
  { type: 'INCOME', name: 'Outras receitas', color: 'slate', expenseClass: null },
  { type: 'EXPENSE', name: 'Moradia', color: 'indigo', expenseClass: 'FIXED' },
  { type: 'EXPENSE', name: 'Saúde', color: 'red', expenseClass: 'FIXED' },
  { type: 'EXPENSE', name: 'Educação', color: 'purple', expenseClass: 'FIXED' },
  { type: 'EXPENSE', name: 'Contas e serviços', color: 'cyan', expenseClass: 'FIXED' },
  { type: 'EXPENSE', name: 'Assinaturas', color: 'teal', expenseClass: 'FIXED' },
  { type: 'EXPENSE', name: 'Alimentação', color: 'orange', expenseClass: 'VARIABLE' },
  { type: 'EXPENSE', name: 'Transporte', color: 'blue', expenseClass: 'VARIABLE' },
  { type: 'EXPENSE', name: 'Lazer', color: 'pink', expenseClass: 'VARIABLE' },
  { type: 'EXPENSE', name: 'Compras', color: 'amber', expenseClass: 'VARIABLE' },
  { type: 'EXPENSE', name: 'Outras despesas', color: 'slate', expenseClass: 'VARIABLE' },
  { type: 'EXPENSE', name: 'Reserva de emergência', color: 'lime', expenseClass: 'INVESTMENT' },
  { type: 'EXPENSE', name: 'Investimentos', color: 'green', expenseClass: 'INVESTMENT' },
];

/** Chave de unicidade do nome (RN-16): sem espaços nas pontas e em minúsculas. */
export function categoryNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}
