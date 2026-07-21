-- P9.1: factory capacity — schedule blocks + company holidays
ALTER TABLE "Account" ADD COLUMN "holidays" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleBlock_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleBlock_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ScheduleBlock_jobId_idx" ON "ScheduleBlock"("jobId");
CREATE INDEX "ScheduleBlock_stationId_day_idx" ON "ScheduleBlock"("stationId", "day");
