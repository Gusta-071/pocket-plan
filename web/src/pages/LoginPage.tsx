import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, AuthCard, Field } from '../components/Form';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

export function LoginPage({ notice }: { notice?: string }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { onSubmit, submitting, error, fieldErrors } = useSubmit(() => login(email, password));

  return (
    <AuthCard title="Entrar" subtitle="Acesse seu planejamento financeiro.">
      {notice && <Alert kind="success">{notice}</Alert>}
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
        <Field
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Link className="form__aside" href="/esqueci-senha">
          Esqueci minha senha
        </Link>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="auth-card__footer">
        Ainda não tem conta? <Link href="/cadastro">Criar conta</Link>
      </p>
    </AuthCard>
  );
}
