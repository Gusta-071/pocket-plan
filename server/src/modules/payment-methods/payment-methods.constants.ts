import { categoryNameKey } from '../categories/categories.constants.js';

/** Tipos de forma de pagamento (RN-67 a RN-70). */
export const PAYMENT_METHOD_KINDS = ['PIX', 'DEBIT', 'CREDIT', 'CASH', 'BOLETO', 'UNSPECIFIED', 'CUSTOM'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

/** RN-69 */
export const MAX_CUSTOM_PAYMENT_METHODS = 10;

/**
 * Formas criadas com toda conta (RN-68), mais a "Não informada" (RN-70),
 * que só existe para as despesas anteriores à RN-67 e nunca é oferecida para escolha.
 */
export const DEFAULT_PAYMENT_METHODS: { kind: PaymentMethodKind; name: string }[] = [
  { kind: 'PIX', name: 'Pix' },
  { kind: 'DEBIT', name: 'Débito' },
  { kind: 'CREDIT', name: 'Crédito' },
  { kind: 'CASH', name: 'Dinheiro' },
  { kind: 'BOLETO', name: 'Boleto' },
  { kind: 'UNSPECIFIED', name: 'Não informada' },
];

/** Para criar as formas padrão junto com a conta. */
export const defaultPaymentMethodsData = () =>
  DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method, nameKey: categoryNameKey(method.name) }));

/** A mesma regra de unicidade de nome das categorias (RN-16, RN-69). */
export const paymentMethodNameKey = categoryNameKey;
