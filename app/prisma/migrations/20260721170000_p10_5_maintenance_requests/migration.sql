-- P10.5: portal maintenance requests
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "message" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "convertedJobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MaintenanceRequest_status_idx" ON "MaintenanceRequest"("status");
