-- Hardware ordering, phase 3: what a job needs of each stock line.
--
-- This table is also the reservation. A job's outstanding need — required minus
-- picked — is what it holds against the shelf, so a second job sees only what is
-- genuinely free. Deliberately not a separate reservations table: two records of
-- the same fact drift, and a stale reservation silently over-promises stock.
--
-- Quantities are pieces throughout. Stock is counted in packs and a cut list
-- needs pieces; mixing the two is the mistake this feature exists to prevent.
CREATE TABLE "JobHardware" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "hardwareItemId" TEXT NOT NULL,
    "requiredPieces" INTEGER NOT NULL DEFAULT 0,
    "pickedPieces" INTEGER NOT NULL DEFAULT 0,
    -- derived = produced by the rules from an imported board report, replaced
    -- wholesale on re-import. manual = added by hand and left alone by imports.
    "source" TEXT NOT NULL DEFAULT 'derived',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobHardware_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobHardware_hardwareItemId_fkey" FOREIGN KEY ("hardwareItemId") REFERENCES "HardwareItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per stock line per job: the requirement is a total, not a log.
CREATE UNIQUE INDEX "JobHardware_jobId_hardwareItemId_key" ON "JobHardware"("jobId", "hardwareItemId");
CREATE INDEX "JobHardware_hardwareItemId_idx" ON "JobHardware"("hardwareItemId");
