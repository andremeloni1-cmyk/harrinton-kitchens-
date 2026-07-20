-- Remembered contacts (name / email / phone) for autosuggest.
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");
