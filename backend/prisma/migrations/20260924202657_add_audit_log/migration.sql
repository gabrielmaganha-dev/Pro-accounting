-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'CANCEL', 'REOPEN', 'DELETE', 'PAYMENT_REGISTERED', 'PAYMENT_REVERSED', 'ROLE_CHANGED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'SETTINGS_UPDATED', 'EXPORT');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('SESSION', 'USER', 'CLIENT', 'CONTRACT', 'INVOICE', 'PAYMENT', 'SETTINGS', 'REPORT');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" VARCHAR(120),
    "user_email" VARCHAR(180),
    "action" "AuditAction" NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entity_id" TEXT,
    "entity_label" VARCHAR(180),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "settings_updated_by_idx" ON "settings"("updated_by");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
