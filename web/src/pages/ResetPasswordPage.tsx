import { useState } from 'react';
import { Alert, AuthCard, Field } from '../components/Form';
import { PasswordStrength } from '../components/PasswordStrength';
import { api } from '../lib/api';
import { Link } from '../lib/router';
import { useSubmit } from '../lib/useSubmit';

export function ResetPasswordPage({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const { onSubmit, submitting, error, fieldErrors } = useSubmit(async () => {
    setMismatch(password !== confirmation);
    if (password !== confirmation) return;
    await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
    // RN-09d: todas as sessões foram encerradas. Recarrega a página para o app
    // esquecer um eventual login aberto e pedir a senha nova.
    window.location.replace('/login?senha-redefinida=1');
  });

  if (!token) {
    return (
      <AuthCard title="Link inválido">
        <Alert kind="error">Este link de redefinição é inválido. Solicite um novo.</Alert>
        <p className="auth-card__footer">
          <Link href="/esqueci-senha">Solicitar novo link</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nova senha" subtitle="Defina a nova senha da sua conta.">
      {error && (
        <Alert kind="error">
          {error} <Link href="/esqueci-senha">Solicitar novo link</Link>
        </Alert>
      )}
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        >
          <PasswordStrength password={password} />
        </Field>
        <Field
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={mismatch ? 'As senhas não conferem.' : undefined}
        />
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </AuthCard>
  );
}
