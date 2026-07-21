-- P4.3: quote acceptance. Approval records a client's typed-name decision on a
-- quote (or, later, a design), and CompanySettings gains the configurable
-- deposit percentage raised when a quote is accepted.
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "quoteId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'quote',
    "decision" TEXT NOT NULL,
    "signerName" TEXT,
    "comment" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Approval_jobId_idx" ON "Approval"("jobId");

-- CompanySettings is @@map("Account")
ALTER TABLE "Account" ADD COLUMN "depositPercent" REAL NOT NULL DEFAULT 30;
