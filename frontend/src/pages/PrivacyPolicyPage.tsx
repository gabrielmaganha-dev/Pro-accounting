import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';

/**
 * /privacidade — Política de Privacidade.
 *
 * Pública (sem login) porque é exigida pelo Google para publicar o login com
 * Google, e porque quem ainda não tem conta precisa poder lê-la antes de
 * entrar. Descreve o que o sistema REALMENTE faz — se o tratamento de dados
 * mudar (novo provedor, novo dado coletado), este texto e a data de
 * atualização mudam junto.
 */
const RESPONSIBLE = 'Gabriel Maganha';
const CONTACT_EMAIL = 'maganha.gabriel2006@gmail.com';
const UPDATED_AT = '16 de outubro de 2026';

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/login" aria-label="Pro Accounting — ir para o login">
            <Logo variant="full" size={36} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: {UPDATED_AT}</p>

        <p className="mt-6 leading-relaxed text-foreground">
          O <strong>Pro Accounting</strong> é um sistema de gestão de clientes, contratos, faturas e
          pagamentos de escritório contábil, de acesso restrito a pessoas autorizadas. Esta política
          explica quais dados pessoais o sistema trata, para quê, com quem são compartilhados e como
          você exerce os seus direitos, nos termos da Lei Geral de Proteção de Dados Pessoais (LGPD
          — Lei nº 13.709/2018).
        </p>

        <Section title="1. Quem é o responsável">
          <p>
            O responsável pelo tratamento dos dados (controlador) é <strong>{RESPONSIBLE}</strong>,
            responsável pelo sistema Pro Accounting. Para qualquer assunto sobre os seus dados, escreva
            para <EmailLink />.
          </p>
        </Section>

        <Section title="2. Quais dados tratamos">
          <ul>
            <li>
              <strong>Dados da conta de acesso:</strong> nome, e-mail, perfil (administrador ou
              funcionário) e situação da conta (ativa, aguardando aprovação ou bloqueada). Quando o
              acesso é feito com e-mail e senha, a senha é guardada apenas na forma de um código
              irreversível (hash) — ninguém, nem o administrador, consegue lê-la.
            </li>
            <li>
              <strong>Dados recebidos do Google, no “Continuar com Google”:</strong> nome, endereço de
              e-mail (verificado pelo Google), foto do perfil e um identificador da conta. O sistema{' '}
              <strong>nunca</strong> recebe a senha da sua Conta Google e não acessa Gmail, contatos,
              agenda, arquivos ou qualquer outro dado da sua Conta Google.
            </li>
            <li>
              <strong>Registro de atividade (auditoria):</strong> ações realizadas no sistema (como
              entrar, sair, cadastrar, alterar e excluir registros), com data, hora, endereço IP e
              navegador utilizado.
            </li>
            <li>
              <strong>Dados inseridos pelos usuários:</strong> clientes do escritório, contratos,
              faturas e pagamentos cadastrados no sistema durante o trabalho.
            </li>
          </ul>
        </Section>

        <Section title="3. Para que usamos os dados">
          <ul>
            <li>identificar você e permitir o acesso ao sistema (login com e-mail e senha ou com o Google);</li>
            <li>
              controlar quem pode usar o sistema e o que cada pessoa pode fazer — por exemplo, um
              cadastro feito pelo Google só passa a ter acesso depois de aprovado por um administrador;
            </li>
            <li>garantir a segurança, investigar acessos indevidos e manter a trilha de auditoria;</li>
            <li>exibir o seu nome e a sua foto dentro do sistema;</li>
            <li>operar as funções do sistema para o escritório.</li>
          </ul>
          <p>
            As bases legais são a execução de contrato e de procedimentos relacionados ao acesso
            (art. 7º, V, da LGPD), o legítimo interesse na segurança do sistema (art. 7º, IX) e o
            cumprimento de obrigações legais, quando aplicável (art. 7º, II).
          </p>
          <p>
            O uso de informações recebidas das APIs do Google segue a{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado.
          </p>
        </Section>

        <Section title="4. Com quem compartilhamos">
          <p>
            Os dados <strong>não são vendidos</strong> nem usados para publicidade. Eles são tratados
            apenas pelos fornecedores de infraestrutura necessários ao funcionamento do sistema:
          </p>
          <ul>
            <li>
              <strong>Vercel</strong> — hospedagem da aplicação;
            </li>
            <li>
              <strong>Supabase</strong> — banco de dados e autenticação;
            </li>
            <li>
              <strong>Google</strong> — somente para o login com Google, quando você escolhe essa
              opção.
            </li>
          </ul>
          <p>Os dados também podem ser fornecidos a autoridades, quando houver obrigação legal.</p>
        </Section>

        <Section title="5. Onde os dados ficam e como são protegidos">
          <p>
            Os dados são armazenados em banco de dados localizado em São Paulo, no Brasil. A aplicação é
            servida pela Vercel, cuja infraestrutura pode processar as requisições em outros países,
            com as garantias previstas na LGPD para transferência internacional.
          </p>
          <p>
            Entre as medidas de proteção estão: conexão sempre criptografada (HTTPS), senhas guardadas
            apenas como hash, acesso por perfil e com aprovação de novos cadastros, bloqueio imediato de
            contas, registro de auditoria e banco de dados fechado a acesso externo.
          </p>
        </Section>

        <Section title="6. Por quanto tempo guardamos">
          <p>
            Os dados da conta são mantidos enquanto ela existir. Os registros de auditoria e os dados de
            negócio são mantidos pelo tempo necessário à segurança do sistema e ao cumprimento de
            obrigações legais, contábeis e fiscais do escritório. Depois disso, são excluídos ou
            anonimizados.
          </p>
        </Section>

        <Section title="7. Seus direitos">
          <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
          <ul>
            <li>a confirmação de que tratamos os seus dados e o acesso a eles;</li>
            <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>a anonimização, o bloqueio ou a eliminação de dados desnecessários ou excessivos;</li>
            <li>a portabilidade dos dados;</li>
            <li>informações sobre com quem os dados são compartilhados;</li>
            <li>a eliminação dos dados e a revogação do consentimento, quando for o caso.</li>
          </ul>
          <p>
            Para exercer qualquer um desses direitos, escreva para <EmailLink />. Você também pode
            apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
          <p>
            Para retirar o acesso do Pro Accounting à sua Conta Google, use a página{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              Apps com acesso à sua conta
            </a>{' '}
            do Google.
          </p>
        </Section>

        <Section title="8. Cookies e armazenamento no navegador">
          <p>
            O sistema não usa cookies de rastreamento nem de publicidade. Ele guarda no seu navegador
            apenas o necessário para manter a sua sessão aberta e as suas preferências de uso.
          </p>
        </Section>

        <Section title="9. Alterações nesta política">
          <p>
            Esta política pode ser atualizada quando o sistema mudar. A data da última atualização fica
            sempre no topo desta página.
          </p>
        </Section>

        <Section title="10. Contato">
          <p>
            {RESPONSIBLE} — <EmailLink />
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function EmailLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}
