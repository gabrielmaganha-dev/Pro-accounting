-- Login com Google (via Supabase Auth) e situação da conta com três estados.

-- 1. Situação da conta: ACTIVE, PENDING (cadastro aguardando aprovação) e
--    BLOCKED (desligada por um administrador). Substitui o booleano `active`
--    preservando o que já existe: ativo vira ACTIVE, inativo vira BLOCKED.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'BLOCKED');

ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "users" SET "status" = 'BLOCKED' WHERE "active" = false;

DROP INDEX IF EXISTS "users_active_idx";
ALTER TABLE "users" DROP COLUMN "active";
CREATE INDEX "users_status_idx" ON "users"("status");

-- 2. Vínculo com o Supabase Auth: o `sub` do token de quem entra pelo Google.
--    Único: uma identidade Google pertence a no máximo uma conta do sistema.
ALTER TABLE "users" ADD COLUMN "auth_user_id" UUID;
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- 3. Foto do perfil Google.
ALTER TABLE "users" ADD COLUMN "avatar_url" VARCHAR(500);

-- 4. Senha local opcional: conta que entra só com o Google não tem senha.
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "users" DROP CONSTRAINT "users_password_is_hash";
ALTER TABLE "users" ADD CONSTRAINT "users_password_is_hash"
  CHECK ("password" IS NULL OR "password" ~ '^\$2[aby]\$[0-9]{2}\$.{53}$');

-- Toda conta precisa de ao menos um jeito de entrar.
ALTER TABLE "users" ADD CONSTRAINT "users_has_login_method"
  CHECK ("password" IS NOT NULL OR "auth_user_id" IS NOT NULL);

-- Foto só do próprio Google: o endereço vai para uma tag <img> da interface.
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_url_google"
  CHECK ("avatar_url" IS NULL OR "avatar_url" ~ '^https://[a-z0-9.-]+\.googleusercontent\.com/');
