import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '@/components/common/ErrorState';
import { Card } from '@/components/ui/card';

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /** Muda a cada rota: ao navegar para outra tela, o erro anterior é descartado. */
  resetKey: string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

/**
 * Barreira de erro em volta do conteúdo de cada tela.
 *
 * Sem ela, QUALQUER exceção durante a renderização faz o React desmontar a
 * árvore inteira e a pessoa fica olhando para uma página em branco, sem menu e
 * sem explicação. Isso passou a importar mais com as telas carregadas sob
 * demanda: o arquivo de uma tela pode simplesmente não chegar — rede que caiu
 * no meio do caminho, servidor reiniciando — e essa falha chega aqui como erro
 * de renderização.
 *
 * Com a barreira, só a área de conteúdo é substituída pelo aviso. O menu e a
 * barra do topo continuam na tela, então dá para ir a outro lugar ou tentar de
 * novo.
 *
 * É classe porque o React só oferece `getDerivedStateFromError` e
 * `componentDidCatch` em componentes de classe — é o único do projeto.
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Para quem for diagnosticar: o erro original e em qual componente estourou.
    console.error('[Pro Accounting] Falha ao exibir a tela:', error, info.componentStack);
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps): void {
    // Trocou de rota: a tela nova merece a chance de renderizar.
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <Card>
        <ErrorState
          title="Não foi possível abrir esta tela"
          description="Pode ter sido uma falha de conexão ou uma atualização do sistema. Recarregar a página costuma resolver; se continuar, avise o administrador."
          // Recarregar, e não só renderizar de novo: depois de uma atualização
          // do sistema, é o recarregamento que traz os arquivos da versão nova.
          onRetry={() => window.location.reload()}
        />
      </Card>
    );
  }
}
