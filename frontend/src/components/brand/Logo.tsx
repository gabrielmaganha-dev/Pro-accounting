import logoMark from '@/assets/logo-mark.svg';
import logoFull from '@/assets/logo.svg';
import { cn } from '@/lib/utils';

/**
 * Único ponto da aplicação que conhece os arquivos do logotipo.
 *
 * Trocar a marca = substituir src/assets/logo.svg e logo-mark.svg.
 * Nenhuma tela importa os arquivos diretamente. Ver src/assets/LOGO.md.
 */

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
  if (variant === 'mark') {
    return (
      <img
        src={logoMark}
        alt={COMPANY_NAME}
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
      alt={COMPANY_NAME}
      height={size}
      // A largura acompanha a proporção do arquivo; fixá-la deformaria o logo
      // que o cliente enviar se ele tiver outra proporção.
      style={{ height: size, width: 'auto' }}
      className={cn('shrink-0', className)}
    />
  );
}
