import { useEffect, useState } from 'react';
import { api } from './lib/api';

type Health = { status: string; database: string };
type ApiState = 'checking' | 'online' | 'offline';

export function App() {
  const [apiState, setApiState] = useState<ApiState>('checking');

  useEffect(() => {
    api<Health>('/health')
      .then((health) => setApiState(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiState('offline'));
  }, []);

  const label = { checking: 'Verificando servidor…', online: 'Servidor online', offline: 'Servidor indisponível' }[apiState];

  return (
    <main className="shell">
      <section className="card">
        <img src="/icon.svg" alt="" width={48} height={48} />
        <h1>pocket-plan</h1>
        <p>Seu planejamento financeiro, no bolso.</p>
        <span className={`status status--${apiState}`} role="status">
          {label}
        </span>
      </section>
    </main>
  );
}
