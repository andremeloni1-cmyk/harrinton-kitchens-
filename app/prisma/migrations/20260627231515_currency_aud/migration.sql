-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'lead',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduledStart" DATETIME,
    "scheduledEnd" DATETIME,
    "durationMins" INTEGER NOT NULL DEFAULT 120,
    "quoteAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "address" TEXT,
    "clientId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "googleEventId" TEXT,
    "driveFolderId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("address", "clientEmail", "clientId", "clientName", "clientPhone", "createdAt", "currency", "description", "driveFolderId", "durationMins", "googleEventId", "id", "notes", "priority", "quoteAmount", "reference", "scheduledEnd", "scheduledStart", "status", "title", "updatedAt") SELECT "address", "clientEmail", "clientId", "clientName", "clientPhone", "createdAt", "currency", "description", "driveFolderId", "durationMins", "googleEventId", "id", "notes", "priority", "quoteAmount", "reference", "scheduledEnd", "scheduledStart", "status", "title", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_reference_key" ON "Job"("reference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Switch any pre-existing quotes to AUD as well.
UPDATE "Job" SET "currency" = 'AUD' WHERE "currency" = 'GBP';
