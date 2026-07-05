-- Receipt capture + expense tracking (BAS 1B), with optional Xero spend-money push.
ALTER TABLE "Account" ADD COLUMN "xeroBankAccountId" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroBankAccountName" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroExpenseAccountCode" TEXT;

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vendor" TEXT,
  "description" TEXT,
  "category" TEXT,
  "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currency" TEXT NOT NULL DEFAULT 'AUD',
  "total" REAL NOT NULL DEFAULT 0,
  "gst" REAL NOT NULL DEFAULT 0,
  "net" REAL NOT NULL DEFAULT 0,
  "hasGst" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'captured',
  "jobId" TEXT,
  "receiptData" TEXT,
  "receiptMime" TEXT,
  "xeroBankTransactionId" TEXT,
  "xeroContactId" TEXT,
  "pushedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Expense_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Expense_xeroBankTransactionId_key" ON "Expense"("xeroBankTransactionId");
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
