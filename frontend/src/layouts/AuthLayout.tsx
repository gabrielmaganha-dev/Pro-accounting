import { ShieldCheck, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';

/**
 * Casca das telas públicas (login e, futuramente, recuperação de senha).
 *
 * Duas colunas no desktop: painel institucional à esquerda, formulário à
 * direita. No celular o painel some — ele é decorativo, e ocupar meia tela de
 * um aparelho pequeno com decoração empurraria o formulário para baixo da
 * dobra.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        {/* Brilho sutil em âmbar — a cor de destaque da marca, sem competir
            com a leitura do texto. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-amber-400/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-brand-500/20 blur-3xl"
        />

        <Logo variant="lockup" size={40} className="relative text-white" />

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Clientes, contratos e faturas em um só lugar.
          </h2>
          <p className="mt-4 text-brand-100">
            Acompanhe a situação financeira de cada contrato sem planilha paralela.
          </p>

          <ul className="mt-10 space-y-4">
            <FeatureItem icon={Users} title="Clientes organizados">
              Cadastro completo, histórico e situação de cada cliente.
            </FeatureItem>
            <FeatureItem icon={TrendingUp} title="Financeiro claro">
              Recebido, pendente e atrasado sempre à vista.
            </FeatureItem>
            <FeatureItem icon={ShieldCheck} title="Acesso controlado">
              Perfis distintos para administradores e funcionários.
            </FeatureItem>
          </ul>
        </div>

        <p className="relative text-xs text-brand-300">
          © {new Date().getFullYear()} Pro Accounting. Todos os direitos reservados.
        </p>
      </div>

      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <Outlet />
      </div>
    </div>
  );
}

interface FeatureItemProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}

function FeatureItem({ icon: Icon, title, children }: FeatureItemProps) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon className="size-[18px] text-amber-400" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-brand-200">{children}</span>
      </span>
    </li>
  );
}
