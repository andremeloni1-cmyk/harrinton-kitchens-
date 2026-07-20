-- AlterTable
ALTER TABLE "Job" ADD COLUMN "gmailMessageId" TEXT;
ALTER TABLE "Job" ADD COLUMN "gmailThreadId" TEXT;
ALTER TABLE "Job" ADD COLUMN "leadSource" TEXT;

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_email_key" ON "LeadSource"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Job_gmailMessageId_key" ON "Job"("gmailMessageId");

