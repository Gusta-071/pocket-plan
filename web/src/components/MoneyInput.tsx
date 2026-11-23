import { useId } from 'react';
import { formatMoney } from '../lib/money';

const MAX_CENTS = 10_000_000_00; // RN-20

/**
 * Campo de valor em reais. Digita-se só números, e o valor vai se formando da direita
 * para a esquerda, como em apps de banco: 1 → R$ 0,01; 15 → R$ 0,15; 1590 → R$ 15,90.
 * No celular, abre o teclado numérico.
 */
export function MoneyInput({
  label,
  cents,
  onChange,
  error,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
  error?: string;
}) {
  const id = useId();

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 12);
    const value = Number(digits || '0');
    if (value <= MAX_CENTS) onChange(value);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="money-input"
        inputMode="numeric"
        autoComplete="off"
        value={formatMoney(cents)}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <span id={`${id}-error`} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
