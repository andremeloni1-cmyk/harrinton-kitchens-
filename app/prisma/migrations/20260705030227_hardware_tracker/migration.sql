-- CreateTable
CREATE TABLE "HardwareItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "supplier" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'box',
    "packSize" TEXT,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT,
    "notes" TEXT,
    "orderStatus" TEXT NOT NULL DEFAULT 'ok',
    "orderQty" INTEGER,
    "orderNote" TEXT,
    "flaggedAt" DATETIME,
    "orderedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HardwareEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HardwareEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HardwareItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HardwareItem_code_key" ON "HardwareItem"("code");
