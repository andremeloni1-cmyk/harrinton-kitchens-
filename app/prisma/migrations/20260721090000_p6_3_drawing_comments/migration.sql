-- P6.3: the client's review thread on a drawing revision.
CREATE TABLE "DrawingComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrawingComment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DrawingRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DrawingComment_revisionId_idx" ON "DrawingComment"("revisionId");
