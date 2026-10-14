-- =============================================================================
-- Índices em created_at — contratos, faturas e pagamentos
-- =============================================================================
-- O painel abre com "atividade recente": os registros mais novos de cada tabela
-- (ORDER BY created_at DESC LIMIT n). A listagem de contratos também ordena por
-- cadastro por padrão. Só `clients` tinha índice nessa coluna; nas outras três
-- o banco lia e ordenava a tabela inteira a cada abertura do painel.
--
-- Com poucas centenas de linhas isso não se nota. O custo cresce com o
-- histórico — e faturas e pagamentos são justamente as tabelas que só crescem.
--
-- Criação simples (sem CONCURRENTLY): o Prisma roda cada migration dentro de
-- uma transação, e CREATE INDEX CONCURRENTLY não pode rodar em transação. O
-- bloqueio de escrita dura o tempo de montar o índice — milissegundos no volume
-- de um escritório. Numa base com milhões de linhas, este arquivo teria de ser
-- aplicado à mão, fora da transação.
-- =============================================================================

CREATE INDEX "contracts_created_at_idx" ON "contracts"("created_at");

CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at");

CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");
