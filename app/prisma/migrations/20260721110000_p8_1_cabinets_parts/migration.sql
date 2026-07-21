-- P8.1: cabinets and parts extracted from a job's cut-list, plus a per-company
-- extraction hint for the AI.
CREATE TABLE "Cabinet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cabinet_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Cabinet_jobId_idx" ON "Cabinet"("jobId");

CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "cabinetId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'panel',
    "material" TEXT,
    "edging" TEXT,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "lastStationId" TEXT,
    "scannedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Part_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Part_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "Cabinet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Part_jobId_idx" ON "Part"("jobId");
CREATE INDEX "Part_cabinetId_idx" ON "Part"("cabinetId");

ALTER TABLE "Account" ADD COLUMN "extractionHint" TEXT;
