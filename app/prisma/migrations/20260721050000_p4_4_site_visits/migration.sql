-- P4.4: site visits — sales consultations (and, later, check measures) booked to
-- a staff member with a Google Calendar event.
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CONSULT',
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "googleEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SiteVisit_jobId_idx" ON "SiteVisit"("jobId");
