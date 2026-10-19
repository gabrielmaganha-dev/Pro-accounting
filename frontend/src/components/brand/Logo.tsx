import logoMark from '@/assets/logo-mark.png';
import logoWhite from '@/assets/logo-white.png';
import logoFull from '@/assets/logo.png';
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
  /** Logotipo completo, na cor da marca. Fundos claros. */
  | 'full'
  /** Apenas o símbolo, quadrado. Favicon e espaços quadrados. */
  | 'mark'
  /** O mesmo logotipo completo, em branco — para o menu e o painel
   *  azul-escuros, onde a versão na cor da marca ficaria invisível. */
  | 'inverse';

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  /** Altura em px. A largura acompanha a proporção do arquivo. */
  size?: number;
}

const FILES: Record<LogoVariant, string> = {
  full: logoFull,
  mark: logoMark,
  inverse: logoWhite,
};

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
        className={cn('shrink-0 object-contain object-left', className)}
      />
    );
  }

  return (
    <img
      src={FILES[variant]}
      alt={name}
      height={size}
      // A largura acompanha a proporção do arquivo; fixá-la deformaria o logo.
      // `width: auto` não basta: dentro de um `flex-col` sem `items-*` (o painel
      // do AuthLayout) o navegador estica a <img> até a largura do pai. Com
      // `object-contain` o desenho mantém a proporção dentro da caixa esticada,
      // e `object-left` o encosta à esquerda, como ficaria sem o esticamento.
      style={{ height: size, width: variant === 'mark' ? size : 'auto' }}
      className={cn('shrink-0 object-contain object-left', className)}
    />
  );
}
