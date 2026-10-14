import logoMark from '@/assets/logo-mark.svg';
import logoFull from '@/assets/logo.svg';
import { useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/utils';

/**
 * Único ponto da aplicação que conhece os arquivos do logotipo.
 *
 * A marca vem de Configurações → Identidade visual quando houver uma enviada;
 * os arquivos em `src/assets/` são o padrão de fábrica, usados enquanto ninguém
 * enviou nada e enquanto a configuração ainda está carregando. Nenhuma tela
 * importa os arquivos diretamente. Ver src/assets/LOGO.md.
 */

/** Nome padrão, usado antes de a configuração chegar. */
export const COMPANY_NAME = 'Pro Accounting';

type LogoVariant =
  /** Marca completa do arquivo (símbolo + assinatura). Fundos claros. */
  | 'full'
  /** Apenas o símbolo, quadrado. Menu recolhido, avatar, favicon. */
  | 'mark'
  /** Símbolo + nome em texto. O texto herda a cor do elemento pai, então
   *  funciona sobre o menu azul-escuro — onde a versão `full`, que tem o
   *  texto em azul escuro dentro do próprio SVG, ficaria ilegível. */
  | 'lockup';

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  /** Altura do símbolo em px. O restante escala junto. */
  size?: number;
}

export function Logo({ variant = 'full', className, size = 36 }: LogoProps) {
  /**
   * A consulta é compartilhada pelo cache do TanStack Query — as três ou quatro
   * instâncias de `<Logo />` na tela não geram requisições próprias.
   */
  const { data } = useSettings();

  const custom = data?.settings.logo ?? null;
  const name = data?.settings.companyName ?? COMPANY_NAME;

  /**
   * Um logotipo enviado serve às três variantes.
   *
   * O usuário manda UM arquivo, não três, e recortar um símbolo quadrado de uma
   * marca horizontal automaticamente daria um resultado pior do que exibir a
   * marca inteira em escala menor.
   */
  if (custom) {
    return (
      <img
        src={custom}
        alt={name}
        style={{ height: size, width: 'auto' }}
        className={cn('shrink-0 object-contain', className)}
      />
    );
  }

  if (variant === 'mark') {
    return (
      <img
        src={logoMark}
        alt={name}
        width={size}
        height={size}
        className={cn('shrink-0', className)}
      />
    );
  }

  if (variant === 'lockup') {
    return (
      <span className={cn('inline-flex items-center gap-3', className)}>
        <img src={logoMark} alt="" aria-hidden="true" width={size} height={size} className="shrink-0" />
        <span className="flex flex-col leading-none">
          <span className="text-base font-bold tracking-tight">Pro</span>
          <span className="text-sm font-medium tracking-wide opacity-80">Accounting</span>
        </span>
      </span>
    );
  }

  return (
    <img
      src={logoFull}
      alt={name}
      height={size}
      // A largura acompanha a proporção do arquivo; fixá-la deformaria o logo
      // que o cliente enviar se ele tiver outra proporção.
      style={{ height: size, width: 'auto' }}
      className={cn('shrink-0', className)}
    />
  );
}
