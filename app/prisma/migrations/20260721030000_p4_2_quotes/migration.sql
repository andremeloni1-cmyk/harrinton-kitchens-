-- P4.2: versioned quotes per job. Line amounts live in `sections` JSON (dollars,
-- ex GST); totals are stored in integer cents so an accepted quote's figure is
-- exact and feeds the deposit invoice unchanged.
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "sections" TEXT NOT NULL DEFAULT '[]',
    "marginPct" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Quote_jobId_version_key" ON "Quote"("jobId", "version");
