import { useState } from 'react';
import { Alert, AuthCard, Field } from '../components/Form';
import { api } from '../lib/api';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { onSubmit, submitting, error, fieldErrors } = useSubmit(async () => {
    setMessage(null);
    const result = await api<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setMessage(result.message); // RN-09a: sempre a mesma mensagem
  });

  return (
    <AuthCard title="Recuperar senha" subtitle="Informe seu e-mail para receber um link de redefinição.">
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar link'}
        </button>
      </form>
      <p className="auth-card__footer">
        <Link href="/login">Voltar para o login</Link>
      </p>
    </AuthCard>
  );
}
