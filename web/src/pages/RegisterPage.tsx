import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, AuthCard, Field } from '../components/Form';
import { PasswordStrength } from '../components/PasswordStrength';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

export function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  // RN-08b: ao concluir, o usuário já fica logado e o App leva à tela inicial.
  const { onSubmit, submitting, error, fieldErrors } = useSubmit(async () => {
    // RN-05: a senha é digitada duas vezes.
    setMismatch(password !== confirmation);
    if (password !== confirmation) return;
    await register(name, email, password);
  });

  return (
    <AuthCard title="Criar conta" subtitle="Comece a organizar suas finanças.">
      {error && <Alert kind="error">{error}</Alert>}
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field
          label="Nome"
          autoComplete="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        >
          <PasswordStrength password={password} />
        </Field>
        <Field
          label="Confirme a senha"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={mismatch ? 'As senhas não conferem.' : undefined}
        />
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="auth-card__footer">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </AuthCard>
  );
}
