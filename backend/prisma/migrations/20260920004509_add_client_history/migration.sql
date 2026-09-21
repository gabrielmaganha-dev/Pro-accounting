-- CreateEnum
CREATE TYPE "ClientHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "client_history" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "ClientHistoryAction" NOT NULL,
    "field" VARCHAR(60),
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_history_client_id_created_at_idx" ON "client_history"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "client_history_user_id_idx" ON "client_history"("user_id");

-- AddForeignKey
ALTER TABLE "client_history" ADD CONSTRAINT "client_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_history" ADD CONSTRAINT "client_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
