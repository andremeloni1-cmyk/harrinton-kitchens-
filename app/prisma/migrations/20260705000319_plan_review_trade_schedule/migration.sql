-- CreateTable
CREATE TABLE "TradeVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "company" TEXT,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driveFileId" TEXT,
    "webViewLink" TEXT,
    "source" TEXT NOT NULL DEFAULT 'gmail',
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileData" TEXT,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("createdAt", "driveFileId", "id", "jobId", "mimeType", "name", "source", "webViewLink") SELECT "createdAt", "driveFileId", "id", "jobId", "mimeType", "name", "source", "webViewLink" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
