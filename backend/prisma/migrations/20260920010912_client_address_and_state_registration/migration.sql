-- =============================================================================
-- Desmembramento do endereço do cliente + Inscrição Estadual
-- =============================================================================
-- O `prisma migrate` gerou originalmente um único ALTER TABLE que fazia
-- DROP COLUMN "address" junto com a criação das colunas novas — e avisou:
-- "All the data in the column will be lost".
--
-- Esta versão foi reescrita à mão para NÃO perder dado. A ordem importa:
--
--   1. cria as colunas novas (ficam nulas)
--   2. COPIA o conteúdo de `address` para `street`
--   3. só então remove `address`
--
-- Executar o passo 3 antes do 2 apagaria o logradouro de todos os clientes
-- já cadastrados, de forma irreversível — a migração não tem volta e não há
-- backup automático em desenvolvimento.
--
-- A cópia vai para `street` porque é onde o texto livre antigo mais se
-- aproxima semanticamente. Número, complemento e bairro ficam nulos: separar
-- "Rua X, 123 - Centro" por expressão regular acertaria em alguns casos e
-- produziria lixo em outros, e lixo silencioso num cadastro é pior do que
-- campo vazio que a pessoa percebe e preenche.
-- =============================================================================

-- 1. Colunas novas
ALTER TABLE "clients"
  ADD COLUMN "state_registration" VARCHAR(20),
  ADD COLUMN "street"            VARCHAR(180),
  ADD COLUMN "number"            VARCHAR(20),
  ADD COLUMN "complement"        VARCHAR(120),
  ADD COLUMN "neighborhood"      VARCHAR(120);

-- 2. Preserva o endereço existente
--    LEFT(..., 180) porque a coluna antiga aceitava 255 caracteres e a nova
--    aceita 180; sem o corte, um endereço longo abortaria a migração inteira.
UPDATE "clients"
SET "street" = LEFT("address", 180)
WHERE "address" IS NOT NULL
  AND btrim("address") <> '';

-- 3. Remove a coluna antiga
ALTER TABLE "clients" DROP COLUMN "address";
