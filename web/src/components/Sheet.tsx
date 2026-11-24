import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Janela sobre a tela, com o <dialog> nativo (foco, Esc e acessibilidade prontos).
 * No celular ela sobe da parte de baixo; no PC aparece centralizada.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clique no fundo escuro (fora do conteúdo) fecha a janela.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="sheet__body">
        <header className="sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="sheet__close" aria-label="Fechar" onClick={onClose}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
