-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'PENDING', 'RENEWAL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'TRANSFER', 'CASH', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "company_name" VARCHAR(180),
    "cpf_cnpj" VARCHAR(14) NOT NULL,
    "email" VARCHAR(180),
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "address" VARCHAR(255),
    "city" VARCHAR(120),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(8),
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "service_type" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "monthly_value" DECIMAL(12,2) NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "contract_id" TEXT,
    "number" VARCHAR(30) NOT NULL,
    "description" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "registered_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_active_idx" ON "users"("active");

-- CreateIndex
CREATE UNIQUE INDEX "clients_cpf_cnpj_key" ON "clients"("cpf_cnpj");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_created_at_idx" ON "clients"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

-- CreateIndex
CREATE INDEX "contracts_client_id_idx" ON "contracts"("client_id");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_end_date_idx" ON "contracts"("end_date");

-- CreateIndex
CREATE INDEX "contracts_status_end_date_idx" ON "contracts"("status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");

-- CreateIndex
CREATE INDEX "invoices_contract_id_idx" ON "invoices"("contract_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_registered_by_idx" ON "payments"("registered_by");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
