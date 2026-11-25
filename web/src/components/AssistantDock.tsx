import { useEffect, useRef, useState } from 'react';
import { Assistant } from './Assistant';

/** A partir desta largura, o assistente é uma gaveta fixa à direita; abaixo, abre por cima da tela. */
const DESKTOP_QUERY = '(min-width: 1280px)';
const STORAGE_KEY = 'pp-assistant-open';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Assistente retrátil (issue #17).
 * - PC: gaveta à direita, com a altura inteira abaixo do topo; fechada, sobra uma aba na borda e o painel
 *   usa a largura toda. A escolha (aberto ou fechado) fica salva no navegador.
 * - Celular e telas menores: botão flutuante; o assistente sobe por cima da tela e começa fechado.
 * O assistente fica sempre montado: fechar e abrir não perde a conversa.
 */
export function AssistantDock({ onSaved }: { onSaved: () => void }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [desktopOpen, setDesktopOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'closed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = desktop ? desktopOpen : mobileOpen;
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function setOpen(next: boolean) {
    if (desktop) {
      setDesktopOpen(next);
      localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
    } else {
      setMobileOpen(next);
    }
    if (!next) window.setTimeout(() => toggleRef.current?.focus(), 0);
  }

  // No PC, o conteúdo da página abre espaço para a gaveta.
  useEffect(() => {
    const root = document.documentElement;
    if (desktop && open) root.dataset.assistant = 'open';
    else delete root.dataset.assistant;
    return () => {
      delete root.dataset.assistant;
    };
  }, [desktop, open]);

  // Ao abrir, o foco vai para o campo de mensagem.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(), 260);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`assistant-toggle ${open ? 'assistant-toggle--hidden' : ''}`}
        aria-expanded={open}
        aria-controls="assistant-dock"
        onClick={() => setOpen(true)}
        title="Abrir o assistente"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        <span className="assistant-toggle__label">Assistente</span>
      </button>

      {!desktop && open && <div className="assistant-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}

      <div
        id="assistant-dock"
        ref={panelRef}
        className={`assistant-dock ${open ? 'assistant-dock--open' : ''}`}
        role={desktop ? 'complementary' : 'dialog'}
        aria-modal={desktop ? undefined : true}
        aria-label="Assistente"
        inert={!open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <button type="button" className="assistant-dock__close" aria-label="Fechar o assistente" title="Fechar" onClick={() => setOpen(false)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {desktop ? <path d="M9 6l6 6-6 6" /> : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
        </button>
        <Assistant onSaved={onSaved} />
      </div>
    </>
  );
}
