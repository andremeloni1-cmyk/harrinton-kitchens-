-- Emailing invoices and chasing payment.
ALTER TABLE "Invoice" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "lastRemindedAt" DATETIME;

-- Tax-invoice letterhead. An Australian tax invoice over $82.50 must show the
-- supplier's ABN, so there has to be somewhere to put one.
ALTER TABLE "Account" ADD COLUMN "abn" TEXT;
ALTER TABLE "Account" ADD COLUMN "paymentDetails" TEXT;
