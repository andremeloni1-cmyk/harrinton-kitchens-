-- Deliveries: truck loads, their stops, the loading list vs what went on, and
-- photographic proof of delivery.
CREATE TABLE "Load" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "driverId" TEXT,
    "driverName" TEXT,
    "vehicle" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "departedAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Load_reference_key" ON "Load"("reference");

CREATE TABLE "LoadStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "LoadStop_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoadStop_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LoadStop_loadId_jobId_key" ON "LoadStop"("loadId", "jobId");
CREATE INDEX "LoadStop_loadId_idx" ON "LoadStop"("loadId");

CREATE TABLE "LoadItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "stopId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'extra',
    "cabinetId" TEXT,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "expected" BOOLEAN NOT NULL DEFAULT true,
    "loadedAt" DATETIME,
    "loadedById" TEXT,
    "method" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoadItem_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoadItem_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "LoadStop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LoadItem_loadId_idx" ON "LoadItem"("loadId");
CREATE INDEX "LoadItem_stopId_idx" ON "LoadItem"("stopId");

CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "stopId" TEXT,
    "itemId" TEXT,
    "photoData" TEXT NOT NULL,
    "photoMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "photoHash" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "latitude" REAL,
    "longitude" REAL,
    "deliveredById" TEXT,
    "deliveredByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryProof_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryProof_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "LoadStop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryProof_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LoadItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeliveryProof_loadId_idx" ON "DeliveryProof"("loadId");
CREATE INDEX "DeliveryProof_itemId_idx" ON "DeliveryProof"("itemId");
