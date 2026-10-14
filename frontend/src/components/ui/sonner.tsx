import type * as React from 'react';
import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Notificações efêmeras (sucesso, erro, aviso).
 *
 * Montado uma única vez em App.tsx. As telas apenas chamam
 * `toast.success('...')` / `toast.error('...')` importando de 'sonner'.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={4000}
      // Abaixo da barra do topo (64px). Sem o recuo, cada aviso cobria por
      // quatro segundos justamente o sino e o menu do usuário — e, no celular,
      // o botão do menu.
      offset={{ top: 76, right: 24 }}
      mobileOffset={{ top: 72, left: 16, right: 16 }}
      toastOptions={{
        classNames: {
          toast: 'font-sans',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
