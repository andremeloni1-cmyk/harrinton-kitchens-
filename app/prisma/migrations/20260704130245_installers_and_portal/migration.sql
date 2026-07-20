-- CreateTable
CREATE TABLE "Installer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Installer',
    "email" TEXT,
    "phone" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0d9488',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "todos" TEXT NOT NULL DEFAULT '[]',
    "maintenanceTasks" TEXT NOT NULL DEFAULT '[]',
    "estimateItems" TEXT NOT NULL DEFAULT '[]',
    "address" TEXT,
    "companyId" TEXT,
    "clientId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "installerId" TEXT,
    "leadSource" TEXT,
    "gmailMessageId" TEXT,
    "gmailThreadId" TEXT,
    "flag" TEXT,
    "googleEventId" TEXT,
    "googleEventIds" TEXT,
    "driveFolderId" TEXT,
    "drivePhotosFolderId" TEXT,
    "notes" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Installer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("address", "clientEmail", "clientId", "clientName", "clientPhone", "companyId", "completedAt", "createdAt", "currency", "description", "driveFolderId", "drivePhotosFolderId", "durationMins", "estimateItems", "flag", "gmailMessageId", "gmailThreadId", "googleEventId", "googleEventIds", "id", "leadSource", "maintenanceTasks", "notes", "priority", "quoteAmount", "reference", "scheduledEnd", "scheduledStart", "status", "title", "todos", "updatedAt") SELECT "address", "clientEmail", "clientId", "clientName", "clientPhone", "companyId", "completedAt", "createdAt", "currency", "description", "driveFolderId", "drivePhotosFolderId", "durationMins", "estimateItems", "flag", "gmailMessageId", "gmailThreadId", "googleEventId", "googleEventIds", "id", "leadSource", "maintenanceTasks", "notes", "priority", "quoteAmount", "reference", "scheduledEnd", "scheduledStart", "status", "title", "todos", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_reference_key" ON "Job"("reference");
CREATE TABLE "new_MaintenanceReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "installerId" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "pdfPath" TEXT,
    "driveFileId" TEXT,
    "webViewLink" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceReport_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Installer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MaintenanceReport" ("createdAt", "data", "driveFileId", "id", "jobId", "pdfPath", "sentAt", "status", "updatedAt", "webViewLink") SELECT "createdAt", "data", "driveFileId", "id", "jobId", "pdfPath", "sentAt", "status", "updatedAt", "webViewLink" FROM "MaintenanceReport";
DROP TABLE "MaintenanceReport";
ALTER TABLE "new_MaintenanceReport" RENAME TO "MaintenanceReport";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Installer_email_key" ON "Installer"("email");
