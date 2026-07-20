-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "jobsCreated" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_messageId_key" ON "ProcessedEmail"("messageId");

