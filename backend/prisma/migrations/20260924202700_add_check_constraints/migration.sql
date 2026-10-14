-- =============================================================================
-- Constraints CHECK — a última linha de defesa das invariantes de negócio
-- =============================================================================
-- Até aqui estas regras eram garantidas APENAS pelos schemas Zod da API. Isso
-- cobre o caminho normal, mas não cobre: um script de migração de dados, uma
-- correção manual via psql, um seed mal escrito ou um bug futuro que monte um
-- `prisma.update` sem passar pelo validador.
--
-- Uma fatura com valor negativo gravada por qualquer um desses caminhos
-- contamina todo relatório financeiro daí em diante, e não existe como
-- descobrir quando entrou. O banco recusando a linha é o que torna o estado
-- inválido impossível, em vez de apenas improvável.
--
-- Escritas à mão porque o Prisma não expressa CHECK no schema. Conferido antes
-- de aplicar: nenhuma linha existente viola qualquer uma delas.
-- =============================================================================

-- --- Dinheiro -----------------------------------------------------------------
-- Valor de face de fatura e de pagamento é sempre positivo. Zero também não
-- serve: uma fatura de R$ 0,00 não é cobrança de nada, é registro perdido.
ALTER TABLE "invoices"  ADD CONSTRAINT "invoices_amount_positive"  CHECK ("amount" > 0);
ALTER TABLE "payments"  ADD CONSTRAINT "payments_amount_positive"  CHECK ("amount" > 0);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_monthly_value_positive" CHECK ("monthly_value" > 0);

-- --- Dia de vencimento --------------------------------------------------------
-- 1 a 31. O dia 31 em mês de 30 é tratado na aplicação, que ajusta para o
-- último dia do mês; o que o banco impede é o dia 0, o 32 e o negativo.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31);

-- --- Ordem das datas ----------------------------------------------------------
-- Término não pode anteceder o início. `end_date` nulo é vigência
-- indeterminada, e passa.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_end_after_start"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- Vencimento não pode anteceder a emissão: uma fatura emitida hoje com
-- vencimento na semana passada nasceria atrasada, o que é sempre erro de
-- digitação.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_after_issue"
  CHECK ("due_date" >= "issue_date");

-- --- Documento ----------------------------------------------------------------
-- Só dígitos, e com o tamanho de CPF (11) ou CNPJ (14). Garante no banco a
-- decisão de guardar documento sem máscara — se uma máscara escapar por
-- qualquer caminho, a linha é recusada em vez de furar a unicidade.
ALTER TABLE "clients" ADD CONSTRAINT "clients_cpf_cnpj_digits"
  CHECK ("cpf_cnpj" ~ '^[0-9]+$' AND length("cpf_cnpj") IN (11, 14));

-- --- Configuração -------------------------------------------------------------
-- A antecedência do aviso de vencimento tem os mesmos limites do validador.
ALTER TABLE "settings" ADD CONSTRAINT "settings_due_soon_days_range"
  CHECK ("due_soon_days" BETWEEN 1 AND 90);

-- Cores em hexadecimal de 6 dígitos, minúsculas ou maiúsculas. Uma cor
-- malformada aqui quebraria a geração da rampa na interface.
ALTER TABLE "settings" ADD CONSTRAINT "settings_colors_hex"
  CHECK ("primary_color" ~ '^#[0-9a-fA-F]{6}$' AND "secondary_color" ~ '^#[0-9a-fA-F]{6}$');

-- A tabela de configuração tem UMA linha. O id fixo já garante isso via chave
-- primária; a constraint deixa a intenção explícita para quem ler o schema.
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton"
  CHECK ("id" = 'singleton');

-- --- Usuários -----------------------------------------------------------------
-- Um e-mail sem arroba não é e-mail, e é com ele que se faz login.
ALTER TABLE "users" ADD CONSTRAINT "users_email_shape"
  CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- O hash bcrypt tem 60 caracteres e prefixo conhecido. Esta constraint existe
-- para impedir o pior acidente possível neste sistema: gravar senha em texto
-- puro na coluna. Um bug que esquecesse o `hashPassword` passaria por qualquer
-- teste de fluxo e só seria descoberto num vazamento.
ALTER TABLE "users" ADD CONSTRAINT "users_password_is_hash"
  CHECK ("password" ~ '^\$2[aby]\$[0-9]{2}\$.{53}$');
