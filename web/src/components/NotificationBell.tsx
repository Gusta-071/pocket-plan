import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatDate } from '../../../shared/period';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { navigate, useLocation } from '../lib/router';

/** Aviso (RN-72): a chave identifica a situação; `read` vem de RN-72a. */
export type Notification = { key: string; level: number; href: string; read?: boolean; dismissedUntil?: string } & (
  | { kind: 'OVERDUE'; severity: 'danger'; count: number; expenseCents: number; incomeCents: number }
  | { kind: 'DUE_SOON'; severity: 'warning'; count: number; amountCents: number; untilDate: string }
  | { kind: 'BUDGET'; severity: 'danger' | 'warning'; name: string; isClass: boolean; usedPercent: number; status: string }
  | { kind: 'CARD'; severity: 'danger' | 'warning'; name: string; usedPercent: number; status: string }
  | { kind: 'GOAL'; severity: 'warning'; goal: 'SAVINGS' | 'INVESTMENT'; remainingCents: number; daysLeft: number }
);

export type NotificationsResponse = { notifications: Notification[]; unread: number; dismissed: Notification[] };

const noticeUrl = (key: string, action: 'read' | 'dismiss' | 'restore') => `/notifications/${encodeURIComponent(key)}/${action}`;

/** RN-72b: mostrar de novo um aviso dispensado. */
export const restoreNotice = (key: string) => api(noticeUrl(key, 'restore'), { method: 'POST' });

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Título e detalhe de cada aviso (RN-72). */
export function describeNotice(n: Notification): { title: string; detail: string } {
  switch (n.kind) {
    case 'OVERDUE': {
      const parts = [n.expenseCents > 0 && `${formatMoney(n.expenseCents)} a pagar`, n.incomeCents > 0 && `${formatMoney(n.incomeCents)} a receber`];
      return { title: plural(n.count, 'conta atrasada', 'contas atrasadas'), detail: `${parts.filter(Boolean).join(' e ')}. Marque o que já foi acertado.` };
    }
    case 'DUE_SOON':
      return {
        title: `${plural(n.count, 'conta vence', 'contas vencem')} até ${formatDate(n.untilDate).slice(0, 5)}`,
        detail: n.amountCents > 0 ? `${formatMoney(n.amountCents)} a pagar nos próximos dias.` : 'Confira nas Contas do mês.',
      };
    case 'BUDGET':
      return {
        title: `${n.name}: ${n.status === 'EXCEEDED' ? 'orçamento estourado' : 'orçamento em atenção'}`,
        detail: `${n.usedPercent}% do limite ${n.isClass ? 'da classe' : 'da categoria'} usado neste mês.`,
      };
    case 'CARD':
      return {
        title: `${n.name}: ${n.status === 'EXCEEDED' ? 'limite estourado' : 'limite em atenção'}`,
        detail: `${n.usedPercent}% do limite do cartão em uso.`,
      };
    case 'GOAL':
      return {
        title: `Meta de ${n.goal === 'SAVINGS' ? 'economia' : 'investimento'} ainda não atingida`,
        detail: `Faltam ${formatMoney(n.remainingCents)} e ${plural(n.daysLeft + 1, 'dia', 'dias')} para o fim do período.`,
      };
  }
}

/**
 * Central de avisos (RN-72): sino com contador na barra do topo e a lista num menu suspenso.
 * Os avisos são recarregados a cada troca de tela e ao abrir o menu, porque mudam conforme o usuário age.
 */
export function NotificationBell() {
  const { path } = useLocation();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    try {
      setData(await api<NotificationsResponse>('/notifications'));
    } catch {
      // Sem os avisos, o resto do app continua funcionando; tenta de novo na próxima troca de tela.
    }
  }, []);

  useEffect(() => {
    void load();
    setOpen(false);
  }, [path, load]);

  // Fecha ao clicar fora ou apertar Esc; o foco volta para o sino.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const notifications = data?.notifications ?? null;
  // RN-72a: o contador mostra só os não lidos.
  const count = data?.unread ?? 0;
  const hasDanger = notifications?.some((n) => !n.read && n.severity === 'danger') ?? false;

  /** RN-72a, RN-72c: clicar marca como lido e leva ao item, destacado. */
  async function open_(n: Notification) {
    setOpen(false);
    if (!n.read) await api(noticeUrl(n.key, 'read'), { method: 'POST' }).catch(() => undefined);
    // RN-72c: o destaque pisca na cor do aviso.
    navigate(`${n.href}${n.href.includes('?') ? '&' : '?'}tom=${n.severity}`);
    void load();
  }

  /** RN-72b */
  async function dismissNotice(n: Notification) {
    await api(noticeUrl(n.key, 'dismiss'), { method: 'POST' }).catch(() => undefined);
    void load();
  }

  return (
    <div className="bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="bell__button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count === 0 ? 'Avisos: nenhum novo' : `Avisos: ${count} ${count === 1 ? 'novo' : 'novos'}`}
        title="Avisos"
        onClick={() => {
          if (!open) void load();
          setOpen((value) => !value);
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span className={`bell__count ${hasDanger ? 'bell__count--danger' : ''}`} aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="bell__panel" role="region" aria-label="Avisos">
          <h2 className="bell__title">Avisos</h2>
          {notifications === null ? (
            <p className="muted small">Carregando…</p>
          ) : notifications.length === 0 ? (
            <p className="muted small bell__empty">Tudo em dia por aqui.</p>
          ) : (
            <ul className="bell__list">
              {notifications.map((n) => {
                const { title, detail } = describeNotice(n);
                return (
                  <li key={n.key} className={`bell__entry ${n.read ? 'bell__entry--read' : ''}`}>
                    <button type="button" className={`bell__item bell__item--${n.severity}`} onClick={() => void open_(n)}>
                      <strong>
                        {!n.read && <span className="bell__dot" aria-hidden="true" />}
                        {title}
                      </strong>
                      <span className="small muted">{detail}</span>
                      <span className="visually-hidden">{n.read ? '(lido)' : '(novo)'}</span>
                    </button>
                    <button
                      type="button"
                      className="bell__dismiss"
                      title="Dispensar este aviso por um tempo"
                      aria-label={`Dispensar: ${title}`}
                      onClick={() => void dismissNotice(n)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.dismissed.length > 0 && (
            <p className="small muted bell__footer">
              {data.dismissed.length === 1 ? '1 aviso dispensado' : `${data.dismissed.length} avisos dispensados`} ·{' '}
              <button type="button" className="link-button small" onClick={() => navigate('/configuracoes/avisos?destaque=avisos')}>
                ver em Ajustes
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
