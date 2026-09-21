-- CreateEnum
CREATE TYPE "InvoiceHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'CANCELLED', 'REOPENED', 'PAYMENT_ADDED', 'PAYMENT_REMOVED', 'SETTLED');

-- CreateTable
CREATE TABLE "invoice_history" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "InvoiceHistoryAction" NOT NULL,
    "field" VARCHAR(60),
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_history_invoice_id_created_at_idx" ON "invoice_history"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "invoice_history_user_id_idx" ON "invoice_history"("user_id");

-- AddForeignKey
ALTER TABLE "invoice_history" ADD CONSTRAINT "invoice_history_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_history" ADD CONSTRAINT "invoice_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
