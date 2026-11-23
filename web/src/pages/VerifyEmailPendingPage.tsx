import { useState } from 'react';
import { useAuth, type User } from '../auth/AuthContext';
import { Alert, AuthCard } from '../components/Form';
import { api } from '../lib/api';
import { useSubmit } from '../lib/useSubmit';

/** RN-09g: enquanto o e-mail não for confirmado, esta é a única tela da conta. */
export function VerifyEmailPendingPage({ user }: { user: User }) {
  const { logout, refresh } = useAuth();
  const [sent, setSent] = useState(false);
  const resend = useSubmit(async () => {
    setSent(false);
    await api('/auth/resend-verification', { method: 'POST' });
    setSent(true);
  });
  const check = useSubmit(refresh);

  return (
    <AuthCard title="Confirme seu e-mail">
      <p>
        Enviamos um link de confirmação para <strong>{user.email}</strong>. Abra o e-mail e clique no link para liberar
        sua conta.
      </p>
      <p className="muted">Não encontrou? Confira a caixa de spam ou peça um novo link. O link vale por 24 horas.</p>
      {sent && <Alert kind="success">Enviamos um novo link. O anterior deixou de valer.</Alert>}
      {resend.error && <Alert kind="error">{resend.error}</Alert>}
      <form className="form" onSubmit={check.onSubmit}>
        <button className="button" type="submit" disabled={check.submitting}>
          {check.submitting ? 'Verificando…' : 'Já confirmei'}
        </button>
      </form>
      <form className="form" onSubmit={resend.onSubmit}>
        <button className="button button--ghost" type="submit" disabled={resend.submitting}>
          {resend.submitting ? 'Enviando…' : 'Reenviar e-mail'}
        </button>
      </form>
      <p className="auth-card__footer">
        Não é você?{' '}
        <button className="link-button" type="button" onClick={() => void logout()}>
          Sair
        </button>
      </p>
    </AuthCard>
  );
}
