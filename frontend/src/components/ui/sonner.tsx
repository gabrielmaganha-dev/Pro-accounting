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
