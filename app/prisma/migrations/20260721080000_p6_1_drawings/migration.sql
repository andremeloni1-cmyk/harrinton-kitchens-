-- P6.1: design drawing sets and revisions. A set groups revisions (Rev A, B, …);
-- each revision's files are Documents (Document.drawingRevisionId). Approved and
-- released revisions are immutable — a change needs a new revision.
CREATE TABLE "DrawingSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingSet_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DrawingSet_jobId_idx" ON "DrawingSet"("jobId");

CREATE TABLE "DrawingRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "summaryClient" TEXT,
    "notes" TEXT,
    "sentAt" DATETIME,
    "approvedAt" DATETIME,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingRevision_drawingSetId_fkey" FOREIGN KEY ("drawingSetId") REFERENCES "DrawingSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DrawingRevision_drawingSetId_idx" ON "DrawingRevision"("drawingSetId");

-- Add the revision link to Document.
ALTER TABLE "Document" ADD COLUMN "drawingRevisionId" TEXT REFERENCES "DrawingRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Document_drawingRevisionId_idx" ON "Document"("drawingRevisionId");
