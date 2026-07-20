-- AlterTable
ALTER TABLE "Account" ADD COLUMN "xeroAccessToken" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroLastInvoiceSyncAt" DATETIME;
ALTER TABLE "Account" ADD COLUMN "xeroOrgName" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroRefreshToken" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroTenantId" TEXT;
ALTER TABLE "Account" ADD COLUMN "xeroTokenExpiry" DATETIME;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "xeroContactId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "jobId" TEXT,
    "clientId" TEXT,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "lineItems" TEXT NOT NULL DEFAULT '[]',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "amountDue" REAL NOT NULL DEFAULT 0,
    "reference" TEXT,
    "xeroInvoiceId" TEXT,
    "xeroContactId" TEXT,
    "xeroNumber" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_xeroInvoiceId_key" ON "Invoice"("xeroInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_xeroContactId_key" ON "Client"("xeroContactId");
