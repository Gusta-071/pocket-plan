import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { CategoryColor } from './categories';

export type PaymentMethodKind = 'PIX' | 'DEBIT' | 'CREDIT' | 'CASH' | 'BOLETO' | 'UNSPECIFIED' | 'CUSTOM';

/** Forma de pagamento (RN-67 a RN-70). */
export type PaymentMethod = { id: number; kind: PaymentMethodKind; name: string; selectable: boolean; custom: boolean };

/** Cartão de crédito (RN-51, RN-57). */
export type Card = {
  id: number;
  name: string;
  color: CategoryColor;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  archived: boolean;
  /** RN-55: o que não foi pago, inclusive faturas futuras. */
  usedCents: number;
  availableCents: number;
  usageStatus: 'OK' | 'WARNING' | 'EXCEEDED';
};

/** Formas de pagamento e cartões do usuário, carregados juntos. */
export function usePayments() {
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        api<{ paymentMethods: PaymentMethod[] }>('/payment-methods'),
        api<{ cards: Card[] }>('/cards'),
      ]);
      setMethods(m.paymentMethods);
      setCards(c.cards);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as formas de pagamento.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { methods, cards, error, reload };
}

/** "Pix", ou "Crédito · Cartão principal" nas compras no cartão. */
export function paymentLabel(
  entry: { paymentMethodId: number | null; cardId: number | null },
  methods: PaymentMethod[],
  cards: Card[],
): string | null {
  const method = methods.find((m) => m.id === entry.paymentMethodId);
  if (!method) return null;
  const card = cards.find((c) => c.id === entry.cardId);
  return card ? `${method.name} · ${card.name}` : method.name;
}
