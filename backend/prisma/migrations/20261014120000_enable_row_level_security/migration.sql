-- Liga a segurança por linha (RLS) em todas as tabelas, SEM políticas.
--
-- Por quê: no Supabase, o schema `public` também é exposto pela API de dados
-- da plataforma (PostgREST), acessível com a chave pública do projeto. Este
-- sistema não usa essa API — a aplicação fala com o banco direto, pelo Prisma.
-- Com RLS ligado e nenhuma política, os papéis da API (`anon`,
-- `authenticated`) não enxergam nenhuma linha: a porta fica fechada.
--
-- O que NÃO muda: o dono das tabelas — o usuário que roda as migrations e
-- com o qual a aplicação conecta — não é afetado pelo RLS (só seria com
-- `FORCE ROW LEVEL SECURITY`, que não é usado aqui). Vale no Supabase, no
-- PostgreSQL do Docker e no de desenvolvimento.
--
-- Rodar de novo numa tabela que já tem RLS ligado não faz nada.
-- A tabela de controle do Prisma só existe nos bancos de verdade: no banco
-- temporário que `prisma migrate dev` usa para conferir as migrations
-- (shadow database) ela não é criada, e um ALTER direto quebraria o comando.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
