import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { navigate, useLocation } from './lib/router';
import { CategoriesPage } from './pages/CategoriesPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { EntriesPage } from './pages/EntriesPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { VerifyEmailPendingPage } from './pages/VerifyEmailPendingPage';

/** Telas de entrada, abertas a quem não está logado. */
const PUBLIC_PATHS = ['/login', '/cadastro', '/esqueci-senha', '/redefinir-senha', '/confirmar-email'];
/** Telas abertas por links de e-mail: funcionam logado ou não. */
const EMAIL_LINK_PATHS = ['/redefinir-senha', '/confirmar-email'];

function Routes() {
  const { user } = useAuth();
  const { path, query } = useLocation();
  const isPublic = PUBLIC_PATHS.includes(path);

  const isEmailLink = EMAIL_LINK_PATHS.includes(path);

  // RN-08: sem sessão, vai para o login. Com sessão, as telas de entrada levam ao início,
  // exceto as abertas por links de e-mail, que podem ser usadas a qualquer momento.
  let redirect: string | null = null;
  if (user === null && !isPublic) redirect = '/login';
  else if (user && isPublic && !isEmailLink) redirect = '/';

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  if (user === undefined || redirect) {
    return (
      <main className="shell">
        <span className="muted" role="status">
          Carregando…
        </span>
      </main>
    );
  }

  // RN-09g: sem e-mail confirmado, a conta só vê a tela de confirmação.
  if (user && !user.emailVerified && !isEmailLink) return <VerifyEmailPendingPage user={user} />;

  switch (path) {
    case '/login':
      return (
        <LoginPage
          notice={
            query.has('senha-redefinida')
              ? 'Senha redefinida. Entre com a nova senha.'
              : query.has('conta-excluida')
                ? 'Sua conta e todos os seus dados foram excluídos.'
                : undefined
          }
        />
      );
    case '/cadastro':
      return <RegisterPage />;
    case '/esqueci-senha':
      return <ForgotPasswordPage />;
    case '/confirmar-email':
      return <ConfirmEmailPage token={query.get('token')} />;
    case '/redefinir-senha':
      return <ResetPasswordPage token={query.get('token')} />;
  }

  if (!user) return null;
  return (
    <AppLayout user={user}>
      {path === '/lancamentos' ? (
        <EntriesPage user={user} />
      ) : path === '/configuracoes/pagamentos' ? (
        <PaymentsPage />
      ) : path === '/configuracoes/categorias' || path === '/categorias' ? (
        <CategoriesPage />
      ) : path === '/configuracoes' ? (
        <SettingsPage user={user} />
      ) : (
        <HomePage user={user} />
      )}
    </AppLayout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
