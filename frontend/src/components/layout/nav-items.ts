import {
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { UserRole } from '@/types/auth';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Ausente = visível para todos os perfis. */
  roles?: UserRole[];
}

/**
 * Itens do menu lateral — fonte única, consumida pelo menu fixo do desktop e
 * pela gaveta do celular. Duplicar essa lista nos dois lugares garantiria que
 * um dia elas divergiriam.
 *
 * A ocultação por perfil aqui é conveniência visual, NÃO segurança: quem
 * protege de fato é o guard de rota no frontend e, principalmente, o
 * `roleMiddleware` na API.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Clientes', to: '/clientes', icon: Users },
  { label: 'Contratos', to: '/contratos', icon: FileText },
  { label: 'Faturas', to: '/faturas', icon: ReceiptText },
  { label: 'Pagamentos', to: '/pagamentos', icon: CircleDollarSign },
  // Consolidado do escritório: faturamento total, receita do ano,
  // inadimplência agregada. O funcionário vê o financeiro de cada cliente e
  // contrato nas fichas deles — o que não vê é a soma de tudo.
  { label: 'Financeiro', to: '/financeiro', icon: Wallet, roles: ['ADMIN'] },
  { label: 'Usuários', to: '/usuarios', icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Configurações', to: '/configuracoes', icon: Settings },
];
