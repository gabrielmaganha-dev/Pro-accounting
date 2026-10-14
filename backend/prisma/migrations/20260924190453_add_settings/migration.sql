-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "company_name" VARCHAR(180) NOT NULL DEFAULT 'Pro Accounting',
    "company_cnpj" VARCHAR(14),
    "company_email" VARCHAR(180),
    "company_phone" VARCHAR(11),
    "company_website" VARCHAR(200),
    "company_zip_code" VARCHAR(8),
    "company_street" VARCHAR(180),
    "company_number" VARCHAR(20),
    "company_complement" VARCHAR(120),
    "company_neighborhood" VARCHAR(120),
    "company_city" VARCHAR(120),
    "company_state" VARCHAR(2),
    "logo" TEXT,
    "primary_color" VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    "secondary_color" VARCHAR(7) NOT NULL DEFAULT '#0D9488',
    "due_soon_days" INTEGER NOT NULL DEFAULT 7,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "date_format" VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
