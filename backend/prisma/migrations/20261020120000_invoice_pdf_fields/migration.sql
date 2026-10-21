-- Campos da fatura em PDF. Só acrescenta colunas opcionais: nenhum dado
-- existente muda, e as faturas já emitidas continuam como estão.

-- Observação impressa na fatura.
ALTER TABLE "invoices" ADD COLUMN "notes" VARCHAR(500);

-- Texto do campo "Forma de Pagamento" da fatura, ex.: "PIX CNPJ 11222333000181".
ALTER TABLE "settings" ADD COLUMN "invoice_payment_instructions" VARCHAR(80);
