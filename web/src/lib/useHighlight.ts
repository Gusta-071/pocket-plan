import { useEffect } from 'react';
import { navigate, useLocation } from './router';

/** Quanto tempo o destaque dura, se a animação não avisar que terminou (ex.: animações desativadas). */
const HIGHLIGHT_MS = 2200;
/** As telas carregam os dados depois de abrir; espera o item aparecer por até este tempo. */
const WAIT_MS = 4000;

const TONES = ['danger', 'warning'];

/** Destaca o elemento e tira o destaque quando a animação termina (ou depois de um tempo). */
function flash(element: HTMLElement, tone: string | null) {
  const classes = ['destaque', ...(tone && TONES.includes(tone) ? [`destaque--${tone}`] : [])];
  element.classList.remove(...classes);
  // Força o navegador a recomeçar a animação se o mesmo item for destacado de novo.
  void element.offsetWidth;
  element.classList.add(...classes);
  const clear = () => element.classList.remove(...classes);
  element.addEventListener('animationend', clear, { once: true });
  window.setTimeout(clear, HIGHLIGHT_MS);
}

/**
 * RN-72c: com `?destaque=<alvo>` no endereço, rola até o elemento marcado com `data-destaque="<alvo>"`
 * e o destaca por cerca de 2 segundos, na cor do aviso (`&tom=danger|warning`). Depois, tira os
 * parâmetros do endereço, para o destaque não se repetir ao recarregar. Um `<details>` destacado é aberto.
 */
export function useHighlight() {
  const { path, query } = useLocation();
  const target = query.get('destaque');
  const tone = query.get('tom');

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const started = Date.now();

    function tryFind() {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(`[data-destaque~="${CSS.escape(target!)}"]`);
      if (!element) {
        if (Date.now() - started < WAIT_MS) window.setTimeout(tryFind, 120);
        else navigate(path, { replace: true });
        return;
      }
      if (element instanceof HTMLDetailsElement) element.open = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(element, tone);
      // O destaque já foi disparado; limpar o endereço não o interrompe (ele termina sozinho).
      navigate(path, { replace: true });
    }

    tryFind();
    return () => {
      cancelled = true;
    };
  }, [path, target, tone]);
}
