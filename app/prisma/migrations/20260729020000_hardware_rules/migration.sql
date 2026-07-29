-- Hardware ordering, phase 2: the rules that turn a CAD board report into
-- hardware to order, and the numeric pack size the ordering maths needs.

-- packSize ("100 pcs") is a human label and can't be calculated with. Demand
-- comes out of a cut list in pieces while stock is counted in boxes, so the
-- same fact is also stored as a number. 1 = counted in single pieces, which is
-- the safe reading for every existing line until someone sets a real value.
ALTER TABLE "HardwareItem" ADD COLUMN "piecesPerPack" INTEGER NOT NULL DEFAULT 1;

-- A rule counts panels when panelCode is set, cabinets when it isn't. Patterns
-- are globs (`*` only) so they can be maintained by whoever buys the hardware.
CREATE TABLE "HardwareRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    "cabinetType" TEXT NOT NULL DEFAULT '',
    "panelCode" TEXT NOT NULL DEFAULT '',

    -- Size bands in mm, null meaning unbounded. REAL, not INTEGER: the report
    -- prints half-millimetres and a band compares against what it says.
    "minCabinetWidthMm" REAL,
    "maxCabinetWidthMm" REAL,
    "minCabinetDepthMm" REAL,
    "maxCabinetDepthMm" REAL,
    "minCabinetHeightMm" REAL,
    "maxCabinetHeightMm" REAL,
    "minPanelLengthMm" REAL,
    "maxPanelLengthMm" REAL,
    "minPanelWidthMm" REAL,
    "maxPanelWidthMm" REAL,

    "hardwareItemId" TEXT NOT NULL,
    "qtyPer" REAL NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',

    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    -- Deleting a stock line takes its rules with it; a rule pointing at nothing
    -- can only produce a phantom line on an order.
    CONSTRAINT "HardwareRule_hardwareItemId_fkey" FOREIGN KEY ("hardwareItemId") REFERENCES "HardwareItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HardwareRule_hardwareItemId_idx" ON "HardwareRule"("hardwareItemId");
