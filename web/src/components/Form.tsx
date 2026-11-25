import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="shell shell--auth">
      <div className="shell__theme">
        <ThemeToggle />
      </div>
      <section className="card auth-card">
        <header className="auth-card__header">
          <img src="/logo.png" alt="" width={40} height={40} />
          <span className="brand">Pocket Plan</span>
        </header>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  /** Conteúdo extra abaixo do campo (ex.: indicador de força da senha). */
  children?: ReactNode;
};

export function Field({ label, error, hint, children, type, ...input }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__control">
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            <EyeIcon crossed={revealed} />
          </button>
        )}
      </div>
      {error ? (
        <span id={`${id}-error`} className="field__error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="field__hint">
            {hint}
          </span>
        )
      )}
      {children}
    </div>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'warning'; children: ReactNode }) {
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M3 3l18 18" />}
    </svg>
  );
}
