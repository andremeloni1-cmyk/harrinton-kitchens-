-- P8.2: scan events — a part reaching a station.
CREATE TABLE "StationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StationEvent_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StationEvent_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StationEvent_partId_idx" ON "StationEvent"("partId");
CREATE INDEX "StationEvent_stationId_idx" ON "StationEvent"("stationId");
