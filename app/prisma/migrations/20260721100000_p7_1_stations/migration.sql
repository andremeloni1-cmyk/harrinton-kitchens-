-- P7.1: configurable factory stations and per-job-per-station progress. Seeds
-- the default seven-station line; a job initialises its progress records when it
-- enters PRODUCTION.
CREATE TABLE "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "hoursPerDay" REAL NOT NULL DEFAULT 8,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Station_position_idx" ON "Station"("position");

CREATE TABLE "JobStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockerNote" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobStation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JobStation_jobId_stationId_key" ON "JobStation"("jobId", "stationId");
CREATE INDEX "JobStation_jobId_idx" ON "JobStation"("jobId");

-- Seed the default seven-station line.
INSERT INTO "Station" ("id","name","position","hoursPerDay","active","createdAt","updatedAt") VALUES
('stn_programming','Programming',0,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_cutting','Cutting',1,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_edging','Edging',2,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_assembly','Assembly',3,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_finishing','Finishing',4,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_qc','QC',5,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('stn_dispatch','Dispatch',6,8,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
