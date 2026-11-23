import type { User } from '../auth/AuthContext';
import { Link } from '../lib/router';

/** Tela inicial provisória: o resumo do período entra nas próximas funcionalidades. */
export function HomePage({ user }: { user: User }) {
  return (
    <>
      <h1>Olá, {user.name.split(' ')[0]}!</h1>
      <p className="muted">
        Em breve, aqui aparece o resumo do seu mês financeiro. Enquanto isso, registre seus{' '}
        <Link href="/lancamentos">lançamentos</Link> ou organize suas <Link href="/categorias">categorias</Link>.
      </p>
    </>
  );
}
