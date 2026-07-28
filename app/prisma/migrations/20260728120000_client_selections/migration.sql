-- Client selections: the colours, finishes and hardware chosen for a job.
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "colour" TEXT NOT NULL DEFAULT '',
    "finish" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "photoId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Selection_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Selection_jobId_idx" ON "Selection"("jobId");
