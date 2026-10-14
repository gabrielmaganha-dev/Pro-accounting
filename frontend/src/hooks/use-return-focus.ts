import { useCallback, useRef } from 'react';

/**
 * Devolve o foco a quem abriu um diálogo.
 *
 * O PROBLEMA. O Radix devolve o foco ao `<Trigger>` do diálogo — mas neste
 * sistema nenhum diálogo usa `<Trigger>`: todos abrem por estado
 * (`setOpen(true)` num botão comum). Sem trigger registrado, ao fechar o foco
 * caía no `<body>`, e quem navega por teclado voltava ao topo da página a cada
 * diálogo fechado, tendo de atravessar o menu inteiro de novo.
 *
 * A SOLUÇÃO. Anotar qual elemento tinha o foco no instante em que o diálogo
 * abre e devolvê-lo ali ao fechar. Mora num hook porque `AlertDialog` e `Sheet`
 * precisam exatamente do mesmo comportamento.
 */
export function useReturnFocus() {
  const openerRef = useRef<HTMLElement | null>(null);

  /** Ligar em `onOpenAutoFocus`: roda antes de o foco entrar no diálogo. */
  const rememberOpener = useCallback((): void => {
    const active = document.activeElement;

    if (!(active instanceof HTMLElement) || active === document.body) {
      openerRef.current = null;
      return;
    }

    // Aberto por um item de menu ("Editar dados", "Alterar senha"): o item
    // deixa de existir assim que o menu fecha, então quem recebe o foco de
    // volta é o botão que abriu o menu. O Radix liga os dois por
    // aria-labelledby.
    const menuTriggerId = active.closest('[role="menu"]')?.getAttribute('aria-labelledby');
    const menuTrigger = menuTriggerId ? document.getElementById(menuTriggerId) : null;

    if (menuTrigger) {
      openerRef.current = menuTrigger;
      return;
    }

    // tabIndex negativo = focável só por script ou clique, fora da ordem do
    // Tab. É o caso do `<main tabIndex={-1}>`, que recebe o foco quando se
    // clica numa área sem controle (uma linha de tabela, por exemplo). Ele não
    // "abriu" nada: devolver o foco a um contêiner do tamanho da página não
    // ajuda ninguém e faria o navegador rolar até o topo dele.
    openerRef.current = active.tabIndex < 0 ? null : active;
  }, []);

  /** Ligar em `onCloseAutoFocus`. */
  const restoreFocus = useCallback((event: Event): void => {
    const opener = openerRef.current;
    openerRef.current = null;

    // Quem chamou já decidiu o destino do foco, ou o elemento saiu da tela
    // (a linha da tabela foi excluída, por exemplo): não há para onde voltar.
    if (event.defaultPrevented || !opener || !opener.isConnected) return;

    // Impede o comportamento padrão do Radix, que aqui seria não focar nada.
    event.preventDefault();
    // preventScroll: o botão já estava na tela quando foi clicado; focar não
    // deve mover a página.
    opener.focus({ preventScroll: true });
  }, []);

  return { rememberOpener, restoreFocus };
}
