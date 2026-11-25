import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, AuthCard } from '../components/Form';
import { api } from '../lib/api';
import { Link } from '../lib/router';

type State = { status: 'confirming' } | { status: 'done' } | { status: 'error'; message: string };

/** Página aberta pelo link do e-mail (RN-09f). Funciona logado ou não. */
export function ConfirmEmailPage({ token }: { token: string | null }) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<State>(
    token ? { status: 'confirming' } : { status: 'error', message: 'Este link de confirmação é inválido.' },
  );
  const started = useRef(false);

  useEffect(() => {
    // O link é de uso único: evita a segunda chamada do StrictMode em desenvolvimento.
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(async () => {
        await refresh();
        setState({ status: 'done' });
      })
      .catch((error: unknown) =>
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Erro inesperado.' }),
      );
  }, [token, refresh]);

  if (state.status === 'confirming') {
    return (
      <AuthCard title="Confirmando seu e-mail…">
        <p className="muted" role="status">
          Só um instante.
        </p>
      </AuthCard>
    );
  }

  if (state.status === 'done') {
    return (
      <AuthCard title="E-mail confirmado">
        <Alert kind="success">Tudo certo! Sua conta está liberada.</Alert>
        <Link className="button button--block" href={user ? '/' : '/login'}>
          {user ? 'Ir para o Pocket Plan' : 'Entrar'}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Não foi possível confirmar">
      <Alert kind="error">{state.message}</Alert>
      <p className="muted">
        {user && !user.emailVerified
          ? 'Volte para o início para pedir um novo link.'
          : 'Se você já confirmou, é só entrar normalmente. Se não, entre na sua conta para pedir um novo link.'}
      </p>
      <Link className="button button--block" href={user ? '/' : '/login'}>
        {user ? 'Voltar ao início' : 'Entrar'}
      </Link>
    </AuthCard>
  );
}
