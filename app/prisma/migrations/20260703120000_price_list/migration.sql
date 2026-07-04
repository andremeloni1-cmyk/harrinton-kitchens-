-- Price list of install components (rate card with per-company overrides)
-- and per-job component estimates. Additive only.
CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "price" REAL NOT NULL DEFAULT 0,
    "category" TEXT,
    "companyPrices" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

ALTER TABLE "Job" ADD COLUMN "estimateItems" TEXT NOT NULL DEFAULT '[]';
